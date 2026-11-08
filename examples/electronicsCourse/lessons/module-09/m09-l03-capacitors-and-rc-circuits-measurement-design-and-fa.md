# Capacitors and RC Circuits: measurement, design, and failure evidence

## Why this matters

select dielectric and rating from signal amplitude, bias, frequency, ripple, and accuracy needs. In real electronics, a correct equation is only the beginning: the model must match the operating region, ratings, tolerances, measurement method, and failure conditions. This lesson connects the physical idea to a repeatable engineering workflow.

![Capacitors and RC Circuits: measurement, design, and failure evidence concept diagram](assets/diagrams/m09-overview.svg "Module 9 visual model: Capacitors and RC Circuits: measurement, design, and failure evidence")

## Learning objectives

- Explain series and parallel combinations, time constant, coupling, decoupling in physical and circuit terms.
- Identify the reference directions, units, assumptions, and validity limits of the model.
- Read the relevant graph, table, pin description, or rating in a component datasheet.
- Predict what a safe bench measurement should show and how the instrument may affect it.
- Recognize the characteristic evidence of reversed electrolytic, ceramic capacitance loss under bias, missing discharge path, wrong time constant.

## Core model

The central rule for this module is to **select dielectric and rating from signal amplitude, bias, frequency, ripple, and accuracy needs**. Begin by drawing the complete current path and naming every reference node. Mark known values with units, distinguish nominal values from limits, and state which effects are intentionally neglected. A model is useful only when its assumptions are visible.

The key vocabulary for this lesson is **series and parallel combinations**, **time constant**, **coupling**, **decoupling**. Treat each term as a measurable property rather than a word to memorize. Ask what produces it, where it is measured, what changes it, and which datasheet limit constrains it. When two descriptions appear to conflict, check whether they refer to different frequency, temperature, bias, time scale, or reference direction.

## Measurement and failure evidence

Turn the model into a measurement plan. Name the instrument, connection, range, probe attenuation, bandwidth, sample rate, trigger, reference node, expected value, acceptable range, and stop condition. Measure from source to load and from known-good block to suspect block. Preserve screenshots or tables with configuration metadata.

For **series and parallel combinations**, **time constant**, **coupling**, **decoupling**, distinguish an open, short, incorrect bias, unstable loop, noise coupling, and measurement artifact. A convincing diagnosis predicts a new observation before the measurement and survives a regression test after correction.

## Engineering workflow

1. De-energize the circuit and inspect polarity, ratings, wiring, and likely stored energy.
2. Draw a simplified model that contains the source, return path, load, and measurement connection.
3. Select equations from the model and carry units through every step.
4. Calculate nominal and worst-case values using tolerances and operating limits.
5. Predict at least two observable quantities before powering the circuit.
6. Apply a conservative current limit and measure from the source outward.
7. Compare evidence with prediction; revise one assumption at a time.

## Worked example

Calculate the 10%, 63.2%, 90%, and 99% points for a 10 kΩ and 10 µF charging circuit.

### Reference resolution

τ = RC = 10,000×10 µF = 0.100 s. Charging reaches 10% at −τ ln(0.9)=10.5 ms, 63.2% at 100 ms, 90% at 230 ms, and 99% at 461 ms. After 5τ=0.5 s the remaining error is about 0.67%. Probe resistance and capacitor leakage alter the measured curve.

A defensible solution identifies the unknown, writes the governing relationship symbolically, substitutes values with units, checks order of magnitude, selects a realizable component or setting, and verifies ratings. It then predicts the measurement range rather than a single perfect number. Component tolerance, instrument accuracy, loading, temperature, and wiring resistance explain small differences; a large difference requires a new hypothesis.

## Datasheet and component judgment

Never select a part from its headline value alone. Check absolute maximum ratings, recommended operating conditions, typical versus guaranteed performance, temperature range, package and thermal path, frequency dependence, tolerance, lifetime or drift, and test conditions. Typical values help predict behavior; guaranteed limits decide whether a design is safe. Derate voltage, current, power, and temperature when failure has meaningful consequences.

## Common mistakes and fault evidence

A likely fault pattern is **reversed electrolytic, ceramic capacitance loss under bias, missing discharge path, wrong time constant**. Do not begin by replacing parts. First reproduce the symptom safely, record supply current, divide the system into functional blocks, and measure the boundary between a known-good and suspect block. Opens usually preserve voltage on one side while preventing current; shorts collapse voltage and raise current; bias errors shift a waveform; noise and oscillation require attention to bandwidth, grounding, return paths, and probe technique.

> **Warning:** Keep course labs at extra-low voltage unless a qualified supervisor and appropriate isolated equipment are present. Never connect a bench oscilloscope ground clip to an unknown mains-referenced circuit.

## Guided practice

- Redraw the visual with reference directions and expected polarities.
- Find one real component datasheet and record three guaranteed limits plus their test conditions.
- Calculate one nominal result and one worst-case range.
- Write the exact meter or oscilloscope setup needed to test the prediction safely.
- Explain which single measurement best distinguishes reversed electrolytic, ceramic capacitance loss under bias, missing discharge path, wrong time constant from a healthy circuit.

## Recap

Reliable electronics work combines a physical model, unit-aware calculation, datasheet limits, safe measurement, and evidence-based troubleshooting. Preserve all five in the engineering notebook so another person can reproduce the result.
