# Embedded-System Architecture: measurement, design, and failure evidence

## Why this matters

allocate responsibilities and failure responses at explicit interfaces before choosing parts or code structure. In real electronics, a correct equation is only the beginning: the model must match the operating region, ratings, tolerances, measurement method, and failure conditions. This lesson connects the physical idea to a repeatable engineering workflow.

![Embedded-System Architecture: measurement, design, and failure evidence concept diagram](assets/diagrams/m44-overview.svg "Module 44 visual model: Embedded-System Architecture: measurement, design, and failure evidence")

## Learning objectives

- Explain fault containment, testability in physical and circuit terms.
- Identify the reference directions, units, assumptions, and validity limits of the model.
- Read the relevant graph, table, pin description, or rating in a component datasheet.
- Predict what a safe bench measurement should show and how the instrument may affect it.
- Recognize the characteristic evidence of implicit interface, shared mutable state, watchdog without recovery policy, no observability.

## Core model

The central rule for this module is to **allocate responsibilities and failure responses at explicit interfaces before choosing parts or code structure**. Begin by drawing the complete current path and naming every reference node. Mark known values with units, distinguish nominal values from limits, and state which effects are intentionally neglected. A model is useful only when its assumptions are visible.

The key vocabulary for this lesson is **fault containment**, **testability**. Treat each term as a measurable property rather than a word to memorize. Ask what produces it, where it is measured, what changes it, and which datasheet limit constrains it. When two descriptions appear to conflict, check whether they refer to different frequency, temperature, bias, time scale, or reference direction.

## Measurement and failure evidence

Turn the model into a measurement plan. Name the instrument, connection, range, probe attenuation, bandwidth, sample rate, trigger, reference node, expected value, acceptable range, and stop condition. Measure from source to load and from known-good block to suspect block. Preserve screenshots or tables with configuration metadata.

For **fault containment**, **testability**, distinguish an open, short, incorrect bias, unstable loop, noise coupling, and measurement artifact. A convincing diagnosis predicts a new observation before the measurement and survives a regression test after correction.

## Engineering workflow

1. De-energize the circuit and inspect polarity, ratings, wiring, and likely stored energy.
2. Draw a simplified model that contains the source, return path, load, and measurement connection.
3. Select equations from the model and carry units through every step.
4. Calculate nominal and worst-case values using tolerances and operating limits.
5. Predict at least two observable quantities before powering the circuit.
6. Apply a conservative current limit and measure from the source outward.
7. Compare evidence with prediction; revise one assumption at a time.

## Worked example

Create a block architecture, interface control document, timing budget, and failure-mode table.

### Reference resolution

The architecture document assigns each function to hardware, bootloader, driver, service, or application state machine. Interfaces specify units, ranges, timing, ownership, timeout, and failure response. Timing and memory budgets include worst case. Watchdog recovery records reset cause, contains unsafe outputs, and preserves enough diagnostics without creating a reboot loop.

A defensible solution identifies the unknown, writes the governing relationship symbolically, substitutes values with units, checks order of magnitude, selects a realizable component or setting, and verifies ratings. It then predicts the measurement range rather than a single perfect number. Component tolerance, instrument accuracy, loading, temperature, and wiring resistance explain small differences; a large difference requires a new hypothesis.

## Datasheet and component judgment

Never select a part from its headline value alone. Check absolute maximum ratings, recommended operating conditions, typical versus guaranteed performance, temperature range, package and thermal path, frequency dependence, tolerance, lifetime or drift, and test conditions. Typical values help predict behavior; guaranteed limits decide whether a design is safe. Derate voltage, current, power, and temperature when failure has meaningful consequences.

## Common mistakes and fault evidence

A likely fault pattern is **implicit interface, shared mutable state, watchdog without recovery policy, no observability**. Do not begin by replacing parts. First reproduce the symptom safely, record supply current, divide the system into functional blocks, and measure the boundary between a known-good and suspect block. Opens usually preserve voltage on one side while preventing current; shorts collapse voltage and raise current; bias errors shift a waveform; noise and oscillation require attention to bandwidth, grounding, return paths, and probe technique.

> **Warning:** Keep course labs at extra-low voltage unless a qualified supervisor and appropriate isolated equipment are present. Never connect a bench oscilloscope ground clip to an unknown mains-referenced circuit.

## Guided practice

- Redraw the visual with reference directions and expected polarities.
- Find one real component datasheet and record three guaranteed limits plus their test conditions.
- Calculate one nominal result and one worst-case range.
- Write the exact meter or oscilloscope setup needed to test the prediction safely.
- Explain which single measurement best distinguishes implicit interface, shared mutable state, watchdog without recovery policy, no observability from a healthy circuit.

## Recap

Reliable electronics work combines a physical model, unit-aware calculation, datasheet limits, safe measurement, and evidence-based troubleshooting. Preserve all five in the engineering notebook so another person can reproduce the result.
