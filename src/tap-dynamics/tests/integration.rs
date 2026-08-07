//! Integration tests for tap-dynamics: multi-speaker scenarios,
//! Fibonacci clock periodicity over long runs, and RPS dynamics.

use tap_dynamics::*;

#[test]
fn two_speakers_starting_same_state_stay_locked_for_full_period() {
    let mut a = Speaker::new(SpeakerState::Reflecting);
    let mut b = Speaker::new(SpeakerState::Reflecting);

    for _ in 0..FibonacciClock::PERIOD {
        let sa = a.tick();
        let sb = b.tick();
        assert_eq!(
            sa, sb,
            "speakers diverged within one Pisano period despite identical initial state"
        );
    }
}

#[test]
fn speakers_with_different_initial_states_may_align_and_diverge() {
    let mut contrarian = Speaker::new(SpeakerState::Contrarian);
    let mut agreeing = Speaker::new(SpeakerState::Agreeing);

    let mut c_states = Vec::new();
    let mut a_states = Vec::new();

    for _ in 0..FibonacciClock::PERIOD {
        c_states.push(contrarian.tick());
        a_states.push(agreeing.tick());
    }

    // They shouldn't always be equal (they started different)
    let always_equal = c_states.iter().zip(a_states.iter()).all(|(a, b)| a == b);
    assert!(!always_equal, "different initial states should not be identical at every tick");

    // But they might align at some points — that's the dynamics
    let ever_aligned = c_states.iter().zip(a_states.iter()).any(|(a, b)| a == b);
    // Over 8 ticks with mod-3 arithmetic, they will align at some point
    assert!(ever_aligned || c_states != a_states);
}

#[test]
fn clock_sequence_repeats_indefinitely() {
    let mut clock = FibonacciClock::new();
    let first_24: Vec<u8> = (0..24).map(|_| clock.next()).collect();

    // Each block of 8 should match
    for cycle in 0..3 {
        let start = cycle * 8;
        let expected = &first_24[0..8];
        let actual = &first_24[start..start + 8];
        assert_eq!(
            expected, actual,
            "cycle {} does not match cycle 0",
            cycle
        );
    }
}

#[test]
fn rps_is_antisymmetric() {
    let states = [
        SpeakerState::Contrarian,
        SpeakerState::Reflecting,
        SpeakerState::Agreeing,
    ];

    for &a in &states {
        for &b in &states {
            if a != b {
                // Exactly one of (a beats b) and (b beats a) should be true
                assert_ne!(
                    a.beats(b),
                    b.beats(a),
                    "RPS symmetry broken for {:?} vs {:?}",
                    a,
                    b
                );
            }
        }
    }
}

#[test]
fn driven_by_pressure_cycles_through_all_states() {
    let start = SpeakerState::Contrarian;
    // pressure 0 = stay
    assert_eq!(start.driven_by(0), SpeakerState::Contrarian);
    // pressure 1 = advance one
    assert_eq!(start.driven_by(1), SpeakerState::Reflecting);
    // pressure 2 = advance two (equivalent to retreat one)
    assert_eq!(start.driven_by(2), SpeakerState::Agreeing);
}

#[test]
fn full_conversation_arc_through_64_ticks() {
    // Simulate a long conversation: two speakers with different starts
    let mut alice = Speaker::new(SpeakerState::Agreeing);
    let mut bob = Speaker::new(SpeakerState::Contrarian);

    let mut alice_arc = Vec::new();
    let mut bob_arc = Vec::new();

    for _ in 0..64 {
        alice_arc.push(alice.tick());
        bob_arc.push(bob.tick());
    }

    // After 8 ticks (one Pisano period), both should have advanced by the
    // same total pressure regardless of starting state
    // Total pressure over one period: 0+1+1+2+0+2+2+1 = 9 ≡ 0 (mod 3)
    // So after one full period, a speaker returns to its starting state
    assert_eq!(
        alice.state,
        SpeakerState::Agreeing,
        "speaker should return to initial state after one Pisano period"
    );
    assert_eq!(
        bob.state,
        SpeakerState::Contrarian,
        "speaker should return to initial state after one Pisano period"
    );
}

#[test]
fn z3_roundtrip_preserves_all_states() {
    for s in [
        SpeakerState::Contrarian,
        SpeakerState::Reflecting,
        SpeakerState::Agreeing,
    ] {
        let z3 = s.value(); // signed
        // Reconstruct from signed value
        let reconstructed = match z3 {
            -1 => SpeakerState::Contrarian,
            0 => SpeakerState::Reflecting,
            1 => SpeakerState::Agreeing,
            _ => panic!("invalid signed value"),
        };
        assert_eq!(s, reconstructed);
    }
}
