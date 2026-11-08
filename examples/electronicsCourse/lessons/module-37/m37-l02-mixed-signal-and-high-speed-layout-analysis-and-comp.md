# Mixed-Signal and High-Speed Layout: analysis and component judgment

## Why this matters

preserve continuous reference paths and control geometry where edge rate makes interconnect a transmission line. In real electronics, a correct equation is only the beginning: the model must match the operating region, ratings, tolerances, measurement method, and failure conditions. This lesson connects the physical idea to a repeatable engineering workflow.

![Mixed-Signal and High-Speed Layout: analysis and component judgment concept diagram](assets/diagrams/m37-overview.svg "Module 37 visual model: Mixed-Signal and High-Speed Layout: analysis and component judgment")

## Learning objectives

- Explain differential pairs, termination, ADC references, oscillators in physical and circuit terms.
- Identify the reference directions, units, assumptions, and validity limits of the model.
- Read the relevant graph, table, pin description, or rating in a component datasheet.
- Predict what a safe bench measurement should show and how the instrument may affect it.
- Recognize the characteristic evidence of split-plane crossing, pair asymmetry, stub, reference via missing.

## Core model

The central rule for this module is to **preserve continuous reference paths and control geometry where edge rate makes interconnect a transmission line**. Begin by drawing the complete current path and naming every reference node. Mark known values with units, distinguish nominal values from limits, and state which effects are intentionally neglected. A model is useful only when its assumptions are visible.

The key vocabulary for this lesson is **differential pairs**, **termination**, **ADC references**, **oscillators**. Treat each term as a measurable property rather than a word to memorize. Ask what produces it, where it is measured, what changes it, and which datasheet limit constrains it. When two descriptions appear to conflict, check whether they refer to different frequency, temperature, bias, time scale, or reference direction.

## Analysis and selection

Translate the physical model into an operating-point calculation, transfer relationship, timing budget, truth table, or energy balance. Solve symbolically first so dependencies remain visible. Then select standard parts from guaranteed limits, not marketing names. For **differential pairs**, **termination**, **ADC references**, **oscillators**, compare at least two viable implementations and state why the chosen one better satisfies accuracy, power, speed, noise, cost, availability, and fault behavior.

Worst-case analysis should combine supply range, tolerance, temperature, loading, and aging in the direction that stresses the requirement. Monte Carlo simulation can explore distributions, but it does not replace checking guaranteed corners.

## Engineering workflow

1. De-energize the circuit and inspect polarity, ratings, wiring, and likely stored energy.
2. Draw a simplified model that contains the source, return path, load, and measurement connection.
3. Select equations from the model and carry units through every step.
4. Calculate nominal and worst-case values using tolerances and operating limits.
5. Predict at least two observable quantities before powering the circuit.
6. Apply a conservative current limit and measure from the source outward.
7. Compare evidence with prediction; revise one assumption at a time.

## Worked example

Critique an ADC and differential-pair layout, then redraw current return paths.

### Reference resolution

Do not route a fast signal across a plane split: its return current must detour, increasing loop inductance and radiation. Keep differential geometry and reference consistent, minimize stubs, add nearby return vias at layer transitions, isolate noisy clocks from ADC inputs, and connect analog/digital grounds according to converter current flow rather than slogans.

A defensible solution identifies the unknown, writes the governing relationship symbolically, substitutes values with units, checks order of magnitude, selects a realizable component or setting, and verifies ratings. It then predicts the measurement range rather than a single perfect number. Component tolerance, instrument accuracy, loading, temperature, and wiring resistance explain small differences; a large difference requires a new hypothesis.

## Datasheet and component judgment

Never select a part from its headline value alone. Check absolute maximum ratings, recommended operating conditions, typical versus guaranteed performance, temperature range, package and thermal path, frequency dependence, tolerance, lifetime or drift, and test conditions. Typical values help predict behavior; guaranteed limits decide whether a design is safe. Derate voltage, current, power, and temperature when failure has meaningful consequences.

## Common mistakes and fault evidence

A likely fault pattern is **split-plane crossing, pair asymmetry, stub, reference via missing**. Do not begin by replacing parts. First reproduce the symptom safely, record supply current, divide the system into functional blocks, and measure the boundary between a known-good and suspect block. Opens usually preserve voltage on one side while preventing current; shorts collapse voltage and raise current; bias errors shift a waveform; noise and oscillation require attention to bandwidth, grounding, return paths, and probe technique.

> **Warning:** Keep course labs at extra-low voltage unless a qualified supervisor and appropriate isolated equipment are present. Never connect a bench oscilloscope ground clip to an unknown mains-referenced circuit.

## Guided practice

- Redraw the visual with reference directions and expected polarities.
- Find one real component datasheet and record three guaranteed limits plus their test conditions.
- Calculate one nominal result and one worst-case range.
- Write the exact meter or oscilloscope setup needed to test the prediction safely.
- Explain which single measurement best distinguishes split-plane crossing, pair asymmetry, stub, reference via missing from a healthy circuit.

## Recap

Reliable electronics work combines a physical model, unit-aware calculation, datasheet limits, safe measurement, and evidence-based troubleshooting. Preserve all five in the engineering notebook so another person can reproduce the result.
