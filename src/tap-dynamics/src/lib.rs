//! tap-dynamics: ternary-tenforward-style speaker states over Z3, driven by
//! a Fibonacci-mod-3 clock whose Pisano period is 8.

/// A speaker's stance, represented as an element of Z3 but exposed with the
/// signed values conversation dynamics actually care about.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SpeakerState {
    Contrarian,
    Reflecting,
    Agreeing,
}

impl SpeakerState {
    /// The signed value a caller reasons about: -1, 0, +1.
    pub fn value(self) -> i8 {
        match self {
            SpeakerState::Contrarian => -1,
            SpeakerState::Reflecting => 0,
            SpeakerState::Agreeing => 1,
        }
    }

    fn z3(self) -> u8 {
        match self {
            SpeakerState::Contrarian => 0,
            SpeakerState::Reflecting => 1,
            SpeakerState::Agreeing => 2,
        }
    }

    fn from_z3(v: u8) -> Self {
        match v % 3 {
            0 => SpeakerState::Contrarian,
            1 => SpeakerState::Reflecting,
            _ => SpeakerState::Agreeing,
        }
    }

    /// Rock-paper-scissors over Z3, matching ternary-tenforward's
    /// `react_to`: Contrarian beats Agreeing, Agreeing beats Reflecting,
    /// Reflecting beats Contrarian.
    pub fn beats(self, other: SpeakerState) -> bool {
        (self.z3() + 2) % 3 == other.z3()
    }

    /// Advance this state by an external pressure in {0, 1, 2}, as produced
    /// by `FibonacciClock`. A pressure of 0 holds, 1 advances one step
    /// around the RPS cycle, 2 advances two (equivalently, retreats one).
    pub fn driven_by(self, pressure: u8) -> SpeakerState {
        SpeakerState::from_z3((self.z3() + pressure) % 3)
    }
}

/// Emits the Fibonacci sequence reduced mod 3. Since Fibonacci mod m is
/// eventually periodic (the Pisano period), and pi(3) = 8, this clock
/// cycles through exactly 8 distinct (a, b) states before repeating:
/// 0, 1, 1, 2, 0, 2, 2, 1, [0, 1, 1, 2, ...].
#[derive(Debug, Clone)]
pub struct FibonacciClock {
    a: u8,
    b: u8,
    pub tick: u64,
}

impl FibonacciClock {
    /// The Pisano period of modulus 3.
    pub const PERIOD: u64 = 8;

    pub fn new() -> Self {
        Self { a: 0, b: 1, tick: 0 }
    }

    /// Advance the clock and return the next fibonacci value mod 3.
    pub fn next(&mut self) -> u8 {
        let val = self.a;
        let next = (self.a + self.b) % 3;
        self.a = self.b;
        self.b = next;
        self.tick += 1;
        val
    }
}

impl Default for FibonacciClock {
    fn default() -> Self {
        Self::new()
    }
}

/// A speaker whose stance is nudged forward each tick by the Fibonacci
/// clock's pressure value.
#[derive(Debug, Clone)]
pub struct Speaker {
    pub state: SpeakerState,
    clock: FibonacciClock,
}

impl Speaker {
    pub fn new(initial: SpeakerState) -> Self {
        Self {
            state: initial,
            clock: FibonacciClock::new(),
        }
    }

    /// Advance one tick: draw the next pressure from the clock and apply it
    /// to the current state. Returns the resulting state.
    pub fn tick(&mut self) -> SpeakerState {
        let pressure = self.clock.next();
        self.state = self.state.driven_by(pressure);
        self.state
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn signed_values_match_spec() {
        assert_eq!(SpeakerState::Contrarian.value(), -1);
        assert_eq!(SpeakerState::Reflecting.value(), 0);
        assert_eq!(SpeakerState::Agreeing.value(), 1);
    }

    #[test]
    fn rps_cycle_is_cyclic() {
        // Matches ternary-tenforward's react_to: -1 beats 1, 1 beats 0, 0 beats -1.
        assert!(SpeakerState::Contrarian.beats(SpeakerState::Agreeing));
        assert!(SpeakerState::Agreeing.beats(SpeakerState::Reflecting));
        assert!(SpeakerState::Reflecting.beats(SpeakerState::Contrarian));
        // no state beats itself
        for s in [
            SpeakerState::Contrarian,
            SpeakerState::Reflecting,
            SpeakerState::Agreeing,
        ] {
            assert!(!s.beats(s));
        }
    }

    #[test]
    fn fibonacci_clock_matches_known_sequence_mod_3() {
        let mut clock = FibonacciClock::new();
        let seq: Vec<u8> = (0..8).map(|_| clock.next()).collect();
        assert_eq!(seq, vec![0, 1, 1, 2, 0, 2, 2, 1]);
    }

    #[test]
    fn fibonacci_clock_has_pisano_period_8() {
        let mut clock = FibonacciClock::new();
        let first_cycle: Vec<u8> = (0..FibonacciClock::PERIOD).map(|_| clock.next()).collect();
        let second_cycle: Vec<u8> = (0..FibonacciClock::PERIOD).map(|_| clock.next()).collect();
        assert_eq!(first_cycle, second_cycle);
        assert_eq!(clock.tick, 16);
    }

    #[test]
    fn speaker_ticks_deterministically_from_clock() {
        let mut a = Speaker::new(SpeakerState::Reflecting);
        let mut b = Speaker::new(SpeakerState::Reflecting);
        for _ in 0..12 {
            assert_eq!(a.tick(), b.tick());
        }
    }
}
