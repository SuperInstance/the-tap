//! tap-reflex: a pincher-style reflex shell. Every call to `process` must
//! stay under a hard latency budget (default 50ms): embed the input, match
//! it against known vectors, and decide whether to execute immediately,
//! ask for confirmation, or escalate to a slower path.

use std::time::{Duration, Instant};

pub type Vector = Vec<f32>;

/// Turns raw input into a vector the reflex shell can match against.
pub trait Embedder {
    fn embed(&self, input: &str) -> Vector;
}

/// A dependency-free bag-of-characters embedder: fast enough to stay well
/// inside the reflex budget, good enough to separate distinct short phrases.
/// Swap in a real model-backed embedder once one is wired up over IPC.
pub struct HashEmbedder {
    dims: usize,
}

impl HashEmbedder {
    pub fn new(dims: usize) -> Self {
        Self { dims }
    }
}

impl Embedder for HashEmbedder {
    fn embed(&self, input: &str) -> Vector {
        let mut v = vec![0f32; self.dims];
        for (i, byte) in input.bytes().enumerate() {
            let bucket = (byte as usize).wrapping_add(i) % self.dims;
            v[bucket] += 1.0;
        }
        let norm: f32 = v.iter().map(|x| x * x).sum::<f32>().sqrt();
        if norm > 0.0 {
            for x in v.iter_mut() {
                *x /= norm;
            }
        }
        v
    }
}

pub fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    let dot: f32 = a.iter().zip(b).map(|(x, y)| x * y).sum();
    let na: f32 = a.iter().map(|x| x * x).sum::<f32>().sqrt();
    let nb: f32 = b.iter().map(|x| x * x).sum::<f32>().sqrt();
    if na == 0.0 || nb == 0.0 {
        0.0
    } else {
        dot / (na * nb)
    }
}

/// A known pattern the reflex shell can recognize, with the action to take
/// when a match is strong enough.
pub struct MatchEntry {
    pub label: String,
    pub vector: Vector,
    pub action: String,
}

/// What the reflex shell decided to do with an input.
#[derive(Debug, Clone, PartialEq)]
pub enum Decision {
    /// High-confidence match: run the action immediately.
    Execute { action: String, score: f32 },
    /// Medium-confidence match: surface the action but wait for confirmation.
    Confirm { action: String, score: f32 },
    /// No confident match: hand off to a slower, non-reflex path.
    Escalate { best_score: f32 },
}

#[derive(Debug, Clone, PartialEq)]
pub struct ReflexResult {
    pub decision: Decision,
    pub elapsed: Duration,
    /// Whether the reflex shell finished inside its latency budget.
    pub within_budget: bool,
}

pub struct ReflexShell {
    embedder: Box<dyn Embedder>,
    entries: Vec<MatchEntry>,
    execute_threshold: f32,
    confirm_threshold: f32,
    budget: Duration,
}

impl ReflexShell {
    pub fn new(embedder: Box<dyn Embedder>) -> Self {
        Self {
            embedder,
            entries: Vec::new(),
            execute_threshold: 0.9,
            confirm_threshold: 0.6,
            budget: Duration::from_millis(50),
        }
    }

    pub fn with_thresholds(mut self, execute: f32, confirm: f32) -> Self {
        self.execute_threshold = execute;
        self.confirm_threshold = confirm;
        self
    }

    pub fn with_budget(mut self, budget: Duration) -> Self {
        self.budget = budget;
        self
    }

    pub fn learn(&mut self, label: impl Into<String>, action: impl Into<String>) {
        let label = label.into();
        let vector = self.embedder.embed(&label);
        self.entries.push(MatchEntry {
            label,
            vector,
            action: action.into(),
        });
    }

    /// Run the embed -> match -> execute/confirm/escalate pipeline.
    pub fn process(&self, input: &str) -> ReflexResult {
        let start = Instant::now();

        let query = self.embedder.embed(input);
        let best = self
            .entries
            .iter()
            .map(|e| (e, cosine_similarity(&query, &e.vector)))
            .max_by(|(_, a), (_, b)| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));

        let decision = match best {
            Some((entry, score)) if score >= self.execute_threshold => Decision::Execute {
                action: entry.action.clone(),
                score,
            },
            Some((entry, score)) if score >= self.confirm_threshold => Decision::Confirm {
                action: entry.action.clone(),
                score,
            },
            Some((_, score)) => Decision::Escalate { best_score: score },
            None => Decision::Escalate { best_score: 0.0 },
        };

        let elapsed = start.elapsed();
        ReflexResult {
            decision,
            elapsed,
            within_budget: elapsed <= self.budget,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn shell() -> ReflexShell {
        let mut shell = ReflexShell::new(Box::new(HashEmbedder::new(64)));
        shell.learn("pour a beer", "pour_beer");
        shell.learn("close the tab", "close_tab");
        shell
    }

    #[test]
    fn exact_match_executes() {
        let result = shell().process("pour a beer");
        match result.decision {
            Decision::Execute { action, score } => {
                assert_eq!(action, "pour_beer");
                assert!((score - 1.0).abs() < 1e-5, "score was {score}");
            }
            other => panic!("expected Execute, got {other:?}"),
        }
    }

    #[test]
    fn unrelated_input_escalates() {
        let result = shell().process("negotiate a peace treaty between two warring nations");
        assert!(matches!(result.decision, Decision::Escalate { .. }));
    }

    #[test]
    fn empty_shell_always_escalates() {
        let shell = ReflexShell::new(Box::new(HashEmbedder::new(32)));
        let result = shell.process("anything");
        assert_eq!(result.decision, Decision::Escalate { best_score: 0.0 });
    }

    #[test]
    fn process_stays_within_default_budget() {
        let result = shell().process("pour a beer");
        assert!(
            result.within_budget,
            "reflex pipeline took {:?}, over the 50ms budget",
            result.elapsed
        );
    }

    #[test]
    fn cosine_similarity_of_identical_vectors_is_one() {
        let v = vec![1.0, 2.0, 3.0];
        assert!((cosine_similarity(&v, &v) - 1.0).abs() < 1e-6);
    }

    #[test]
    fn cosine_similarity_of_orthogonal_vectors_is_zero() {
        let a = vec![1.0, 0.0];
        let b = vec![0.0, 1.0];
        assert!(cosine_similarity(&a, &b).abs() < 1e-6);
    }
}
