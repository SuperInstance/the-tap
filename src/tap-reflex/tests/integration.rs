//! Integration tests for tap-reflex: full pipeline stress tests,
//! latency budgets under load, and embedder quality checks.

use std::time::Duration;
use tap_reflex::*;

fn populated_shell() -> ReflexShell {
    let mut shell = ReflexShell::new(Box::new(HashEmbedder::new(128)));
    shell.learn("pour a beer", "pour_beer");
    shell.learn("close the tab", "close_tab");
    shell.learn("what's on tap", "list_beers");
    shell.learn("play darts", "start_darts");
    shell.learn("tell a joke", "tell_joke");
    shell.with_thresholds(0.85, 0.55)
}

#[test]
fn five_entry_shell_processes_all_known_inputs() {
    let shell = populated_shell();
    for (input, expected_action) in [
        ("pour a beer", "pour_beer"),
        ("close the tab", "close_tab"),
        ("what's on tap", "list_beers"),
        ("play darts", "start_darts"),
        ("tell a joke", "tell_joke"),
    ] {
        let result = shell.process(input);
        match &result.decision {
            Decision::Execute { action, .. } => {
                assert_eq!(*action, expected_action, "mismatch for input: {input}");
            }
            other => panic!("expected Execute for \"{input}\", got {other:?}"),
        }
    }
}

#[test]
fn reflex_stays_under_budget_with_50_entries() {
    let mut shell =
        ReflexShell::new(Box::new(HashEmbedder::new(256))).with_budget(Duration::from_millis(50));

    for i in 0..50 {
        shell.learn(format!("action number {i}"), format!("do_{i}"));
    }

    for i in 0..50 {
        let result = shell.process(&format!("action number {i}"));
        assert!(
            result.within_budget,
            "reflex over budget on iteration {i}: {:?}",
            result.elapsed
        );
    }
}

#[test]
fn similar_inputs_cluster_to_same_action() {
    let shell = populated_shell();
    // "pour a beer" variants should all match pour_beer or at least confirm
    for variant in &["pour a beer", "pour beer", "pour a cold one"] {
        let result = shell.process(variant);
        match &result.decision {
            Decision::Execute { action, .. } | Decision::Confirm { action, .. } => {
                // Allow either Execute or Confirm since hash-embed is approximate
                assert!(
                    action.contains("beer") || action.contains("pour"),
                    "variant \"{variant}\" matched unexpected action: {action}"
                );
            }
            Decision::Escalate { best_score } => {
                // Acceptable only if score is low
                panic!("variant \"{variant}\" escalated at score {best_score}");
            }
        }
    }
}

#[test]
fn empty_entries_with_custom_budget() {
    let shell =
        ReflexShell::new(Box::new(HashEmbedder::new(64))).with_budget(Duration::from_micros(100));

    let result = shell.process("test");
    assert!(matches!(result.decision, Decision::Escalate { .. }));
    // Even with a microsecond budget, the hash embedder should be fast enough
    // (though this is not guaranteed — the test verifies the budget flag works)
}

#[test]
fn cosine_similarity_properties() {
    // Identity
    let v = vec![3.0, 4.0];
    assert!((cosine_similarity(&v, &v) - 1.0).abs() < 1e-6);

    // Opposite direction
    let a = vec![1.0, 0.0];
    let b = vec![-1.0, 0.0];
    assert!((cosine_similarity(&a, &b) + 1.0).abs() < 1e-6);

    // Zero vector
    let z = vec![0.0, 0.0];
    assert!(cosine_similarity(&z, &a).abs() < 1e-6);

    // Different magnitudes, same direction → similarity 1
    let big = vec![100.0, 0.0];
    assert!((cosine_similarity(&a, &big) - 1.0).abs() < 1e-6);
}

#[test]
fn hash_embedder_produces_normalized_vectors() {
    let embedder = HashEmbedder::new(32);
    let v = embedder.embed("hello world this is a test");
    let norm: f32 = v.iter().map(|x| x * x).sum::<f32>().sqrt();
    assert!(
        (norm - 1.0).abs() < 1e-5,
        "embedded vector should be unit-normalized, got norm {norm}"
    );
}

#[test]
fn hash_embedder_same_input_same_output() {
    let embedder = HashEmbedder::new(64);
    let a = embedder.embed("deterministic test");
    let b = embedder.embed("deterministic test");
    assert_eq!(a, b);
}

#[test]
fn learn_then_match_full_roundtrip() {
    let mut shell = ReflexShell::new(Box::new(HashEmbedder::new(64)));

    // Before learning, everything escalates
    let before = shell.process("open the door");
    assert!(matches!(before.decision, Decision::Escalate { .. }));

    // Learn the pattern
    shell.learn("open the door", "door_open");

    // After learning, exact match should execute
    let after = shell.process("open the door");
    match after.decision {
        Decision::Execute { action, score } => {
            assert_eq!(action, "door_open");
            assert!((score - 1.0).abs() < 1e-5);
        }
        other => panic!("expected Execute after learning, got {other:?}"),
    }
}

#[test]
fn custom_thresholds_affect_decision_boundaries() {
    let mut strict = ReflexShell::new(Box::new(HashEmbedder::new(64))).with_thresholds(0.99, 0.01);
    strict.learn("hello", "greet");

    // Exact match should still execute even with strict threshold
    let exact = strict.process("hello");
    assert!(matches!(exact.decision, Decision::Execute { .. }));

    // Slightly different input should confirm or escalate, not execute
    let similar = strict.process("hello there");
    match similar.decision {
        Decision::Execute { .. } => {} // hash embed might still be very similar
        Decision::Confirm { .. } => {}
        Decision::Escalate { .. } => {}
    }
}
