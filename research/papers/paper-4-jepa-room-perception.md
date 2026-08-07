# JEPA as Room Perception: Prediction-Without-Generation for Spatial/Social Dynamics

**SuperInstance Fleet Research — Paper 4 of 6**

---

## Abstract

We propose applying LeCun's Joint-Embedding Predictive Architecture (JEPA) to **room-level perception** — modeling the collective state of a space and its occupants rather than tracking individuals. The key insight is that the **prediction error vector in latent space IS the room state**: calm rooms produce near-zero prediction error, chaotic rooms produce large error vectors whose direction encodes *what kind* of change occurred. By discarding the decoder entirely, the system achieves privacy by architecture (no reconstruction of raw sensory data is possible) and computational efficiency (predicting a 512-dimensional vector rather than 4K video). We formalize the mathematical framework, address the failure mode of semantic blindness (high error without understanding), and propose a gated classifier extension to convert raw prediction error into actionable, localized semantic state.

---

## 1. Introduction

The Tap system (`the-tap/src/tap-room/`) implements a MUD-arena-style room graph with a perceive-decide-act loop. The current perception model is based on BFS expansion from the agent's location — a discrete, graph-based approach. But what if we want to perceive the *quality* of a room — its social dynamics, its energy, whether a conversation is heating up or winding down?

Traditional approaches would use a generative model: predict the raw sensory data (video frames, audio waveforms) and compare to reality. This is expensive (predicting 4K video in real time is computationally prohibitive) and invasive (the model can reconstruct images of people, creating privacy risks).

JEPA offers a third path: predict the *abstract representation* of the room, not the raw pixels. The prediction error — the gap between what the model expected and what it observed — becomes the room's state signal. No generation needed.

---

## 2. Background: What is JEPA?

LeCun (2022) proposed JEPA as a path toward autonomous machine intelligence. The architecture has three components:

1. **Encoder** $E_\theta$: Maps raw multi-modal input $X_t$ to a latent representation $s_t = E_\theta(X_t) \in \mathbb{R}^d$.
2. **Predictor** $P_\phi$: Maps the current latent state to a prediction of the next latent state: $\hat{s}_{t+1} = P_\phi(s_t)$.
3. **Loss**: The energy of the prediction error, $\mathcal{L} = \|s_{t+1} - \hat{s}_{t+1}\|^2$, with a crucial **stop-gradient** on the target: $\mathcal{L} = \|\text{StopGrad}(E_\theta(X_{t+1})) - P_\phi(E_\theta(X_t))\|^2$.

The stop-gradient prevents representational collapse — the encoder cannot "cheat" by mapping everything to the same point.

---

## 3. JEPA for Room Perception

### 3.1 The Core Idea

We apply JEPA not to an individual agent but to a **room** as a whole. The input $X_t$ is multi-modal: movement patterns (from the room graph), speech acts (from the conversation layer), ambient signals (presence counts, interaction frequencies).

The room state is defined as:

$$\text{RoomState}(t+1) = \epsilon_{t+1} = \text{StopGrad}(s_{t+1}) - \hat{s}_{t+1}$$

where $s_{t+1} = E_\theta(X_{t+1})$ is the actual encoded observation and $\hat{s}_{t+1} = P_\phi(s_t)$ is the predicted observation.

- $\|\epsilon\| \approx 0$: The room is predictable. Agents are behaving as expected.
- $\|\epsilon\|$ large: Something novel happened. The direction of $\epsilon$ encodes what dimension of the room changed.

### 3.2 Advantages Over Generative Models

**Privacy by Architecture.** Since the decoder is explicitly discarded, the system **cannot** reconstruct raw sensory data from the latent representation. If $s_t$ is leaked, an adversary cannot generate images of occupants or transcripts of conversations. The model holds only *relational dynamics* (who moved, the emotional tone shifted) — never *content* (faces, words). This is "privacy-preserving perception" by design.

**Computational Efficiency.** Predicting raw video (e.g., 4K @ 30fps) is computationally prohibitive. JEPA predicts a compact vector (e.g., $\mathbb{R}^{512}$). This drastically reduces inference cost, enabling real-time room perception on edge devices.

**Focus on Relevant Change.** Generative models waste energy predicting static backgrounds. JEPA's predictor learns to focus only on *foreground dynamics* — movement and interaction — because that is where prediction error concentrates. The model is naturally an **anomaly detector**.

### 3.3 Mathematical Formulation

**Input.** Multi-modal room signals:
$$X_t = [m_t, a_t, c_t, p_t]$$
where $m_t$ = movement features, $a_t$ = audio features, $c_t$ = conversation features, $p_t$ = presence count.

**Encoding.**
$$s_t = E_\theta(X_t) \in \mathbb{R}^{512}$$

**Prediction.**
$$\hat{s}_{t+1} = P_\phi(s_t) \in \mathbb{R}^{512}$$

**Room State (Prediction Error).**
$$\epsilon_{t+1} = \text{StopGrad}(s_{t+1}) - \hat{s}_{t+1} \in \mathbb{R}^{512}$$

**Room State Magnitude** (anomaly score):
$$\|\epsilon_{t+1}\|_2 \in \mathbb{R}_{\geq 0}$$

**Training Loss** (energy minimization with non-collapse regularization):
$$\mathcal{L} = \|\text{StopGrad}(E_\theta(X_{t+1})) - P_\phi(E_\theta(X_t))\|_2^2 + \lambda \cdot \mathcal{R}_{\text{vicreg}}$$

where $\mathcal{R}_{\text{vicreg}}$ is a variance-covariance regularization term (from the VICReg method) that prevents the encoder from collapsing all inputs to a single point.

---

## 4. Connection to Predictive Coding in Neuroscience

JEPA shares a deep structural similarity with Karl Friston's **predictive coding** framework:

| Property | Predictive Coding (Brain) | JEPA (Room) |
|----------|--------------------------|-------------|
| Direction of prediction | Top-down (cortex → sensory) | Forward in time ($s_t \to \hat{s}_{t+1}$) |
| Signal that matters | Prediction error (residual) | Prediction error ($\epsilon$) |
| Generative? | Yes (reconstructs input) | **No** (latent only) |
| Update mechanism | Bayesian belief updating | Gradient descent on energy |
| Collapse prevention | Neural architecture | Stop-gradient + VICReg |

The critical difference: the brain is explicitly generative (it reconstructs sensory input from predictions). JEPA is **non-generative** — it predicts only in latent space and never reconstructs. This makes JEPA a "**non-generative predictive coding**" machine: it borrows "surprise" (error) from neuroscience but strips away the biological imperative to reconstruct, yielding a purely functional, privacy-preserving perception system.

---

## 5. Failure Mode: The "Panic Button" Problem

### 5.1 The Semantic Blindness Issue

Raw prediction error tells you **that** something happened and (via the direction of $\epsilon$) roughly **where** in the latent space it occurred. But it does not tell you **what** happened in semantic terms. A door slamming and a fight breaking out might both produce high $\|\epsilon\|$.

Without a mechanism to convert error into meaning, the system is a highly efficient **panic button** — it knows when something is wrong, but has no idea what to do about it.

### 5.2 Gated Classifier Extension

We propose pairing JEPA with a **gated, sparse event classifier**:

1. **Gate:** $\|\epsilon_{t+1}\|_2 > \theta$ (anomaly threshold)
2. **Classifier:** A small, fast network $C_\psi(\epsilon_{t+1}) \to \{c_1, c_2, \ldots, c_K\}$ that maps the error vector to semantic categories (door event, conversation shift, entry/exit, anomaly).
3. **Spatial Grid:** A coarse spatial grid over the room that localizes the source of the error.

This runs only when the gate fires — so it adds minimal computational overhead during calm periods.

### 5.3 The Exploration Problem

A pure JEPA cannot reduce error through targeted action — it can only observe passively. To handle the exploration-exploitation tradeoff:

- **Latent interpolation:** Hypothesize counterfactuals by perturbing the latent vector (e.g., "what if the agent moved?") and predicting the resulting $\epsilon$. If predicted error is low, the hypothesis is plausible. This is a **non-generative counterfactual engine**.
- **Curiosity signal:** Use $\|\epsilon\|$ as an intrinsic motivation signal — the system attends to rooms with high prediction error, which are the rooms where interesting things are happening.

---

## 6. Implementation Sketch

The Tap system already provides the graph-based room model (`tap-room/src/lib.rs`) with a perceive-decide-act loop and BFS-based perception. The JEPA layer would sit on top:

```
┌─────────────────────────────────────┐
│         Multi-Modal Room Signals     │
│   (movement, speech, ambient, count) │
└──────────────┬──────────────────────┘
               │
    ┌──────────▼──────────┐
    │   Encoder E_θ       │ → s_t ∈ R^512
    └──────────┬──────────┘
               │
    ┌──────────▼──────────┐
    │   Predictor P_φ     │ → ŝ_{t+1} ∈ R^512
    └──────────┬──────────┘
               │
    ┌──────────▼──────────┐
    │   Actual s_{t+1}    │ ← E_θ(X_{t+1})
    └──────────┬──────────┘
               │
    ┌──────────▼──────────┐
    │   Error ε = s - ŝ   │ → Room State
    └─────────────────────┘
```

---

## 7. What JEPA Sees vs. What Generative Models See

| Aspect | Generative Model | JEPA |
|--------|-----------------|------|
| Predicts | Raw pixels/audio | Latent vector |
| Reconstructs | Full scene | Nothing |
| Privacy risk | High (can reconstruct faces, words) | **Zero** (no decoder) |
| Compute | Massive (4K video prediction) | **Minimal** (512-dim vector) |
| Background | Must predict static elements | Ignores (zero error on static) |
| Novel events | Reconstructs then compares | **High error = anomaly signal** |
| Semantic labeling | Implicit (in reconstruction) | Requires separate classifier |

---

## 8. Limitations and Open Questions

1. **No spatial localization:** $\epsilon$ tells you *that* something changed, not *where* in the room. The gated classifier + spatial grid extension addresses this but adds complexity.

2. **Cold start problem:** A freshly-trained JEPA produces high error on everything (it hasn't learned normal room dynamics yet). The system needs a warmup period before $\epsilon$ is meaningful.

3. **Adversarial perturbations:** An adversary who knows the encoder could craft inputs that produce low $\epsilon$ (invisible to the anomaly detector) while being semantically different from normal room behavior.

4. **Multi-room correlation:** If two rooms are coupled (agents move between them), errors in one room should correlate with events in the other. How to model this in the JEPA framework is an open question.

---

## 9. Future Directions

1. **Hierarchical JEPA:** Stack JEPAs at multiple temporal scales — a fast JEPA for movement (10 Hz), a medium JEPA for conversation dynamics (1 Hz), and a slow JEPA for social structure (0.1 Hz). This mirrors the polyrhythmic architecture from Paper 3.

2. **JEPA-to-JEPA communication:** Rooms that share agents could exchange latent representations (not raw data), enabling collaborative perception while preserving privacy.

3. **Active perception:** Instead of passively observing, the system could prompt agents in the room ("can you confirm what just happened?") when $\|\epsilon\|$ spikes, converting anomaly detection into active sensing.

4. **JEPA as room DNA:** Over time, each room develops a unique prediction profile — a "fingerprint" of its normal dynamics. This profile could serve as a room identifier that doesn't depend on physical sensors.

---

## 10. Conclusion

JEPA as Room Perception reframes the problem of understanding a space: instead of modeling individuals and aggregating, model the **room as a single entity** whose state is defined by prediction error. The architecture is privacy-preserving by construction (no decoder means no reconstruction), computationally efficient (latent prediction only), and naturally suited to anomaly detection. Its weakness — semantic blindness — is addressable through a gated classifier extension. The result is a room perception system that knows when something interesting is happening without needing to know (or being able to reveal) what that something looks or sounds like.

---

## References

1. LeCun, Y. (2022). "A Path Towards Autonomous Machine Intelligence." OpenReview.
2. Friston, K. (1999). "A Theory of Cortical Responses." *Philosophical Transactions of the Royal Society B.*
3. Bardes, A. et al. (2022). "VICReg: Variance-Invariance-Covariance Regularization." ICLR.
4. Pathak, D. et al. (2017). "Curiosity-driven Exploration by Self-Supervised Prediction." ICML.
5. Rao, R. & Ballard, D. (1999). "Predictive coding in the visual cortex." *Nature Neuroscience.*

---

*Source: `the-tap/src/tap-room/` — RoomGraph, Perception, Actor trait. Conceptual application of LeCun (2022) to fleet room dynamics.*
