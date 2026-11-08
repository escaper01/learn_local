# Voltage, Current, Resistance, and Ohm's Law: analysis and component judgment

## Why this matters

use V = IR only across the element and operating region where the quantities are defined. In real electronics, a correct equation is only the beginning: the model must match the operating region, ratings, tolerances, measurement method, and failure conditions. This lesson connects the physical idea to a repeatable engineering workflow.

![Voltage, Current, Resistance, and Ohm's Law: analysis and component judgment concept diagram](assets/diagrams/m03-overview.svg "Module 3 visual model: Voltage, Current, Resistance, and Ohm's Law: analysis and component judgment")

## Learning objectives

- Explain Ohm's law, source and load, linearity, open circuits in physical and circuit terms.
- Identify the reference directions, units, assumptions, and validity limits of the model.
- Read the relevant graph, table, pin description, or rating in a component datasheet.
- Predict what a safe bench measurement should show and how the instrument may affect it.
- Recognize the characteristic evidence of open load, shorted resistor, incorrect reference node, nonlinear device treated as a resistor.

## Core model

The central rule for this module is to **use V = IR only across the element and operating region where the quantities are defined**. Begin by drawing the complete current path and naming every reference node. Mark known values with units, distinguish nominal values from limits, and state which effects are intentionally neglected. A model is useful only when its assumptions are visible.

The key vocabulary for this lesson is **Ohm's law**, **source and load**, **linearity**, **open circuits**. Treat each term as a measurable property rather than a word to memorize. Ask what produces it, where it is measured, what changes it, and which datasheet limit constrains it. When two descriptions appear to conflict, check whether they refer to different frequency, temperature, bias, time scale, or reference direction.

## Analysis and selection

Translate the physical model into an operating-point calculation, transfer relationship, timing budget, truth table, or energy balance. Solve symbolically first so dependencies remain visible. Then select standard parts from guaranteed limits, not marketing names. For **Ohm's law**, **source and load**, **linearity**, **open circuits**, compare at least two viable implementations and state why the chosen one better satisfies accuracy, power, speed, noise, cost, availability, and fault behavior.

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

A 9 V source drives an LED modeled at 2.0 V through a resistor. Choose a standard value for approximately 10 mA and check dissipation.

### Reference resolution

The resistor must drop 9−2 = 7 V at 10 mA, so R = 7/0.010 = 700 Ω. The next conservative E12 value is 750 Ω, giving about 9.33 mA. Resistor dissipation is I²R ≈ 0.065 W, so a 0.25 W part has comfortable margin. Recalculate using LED forward-voltage limits, not only 2.0 V typical.

A defensible solution identifies the unknown, writes the governing relationship symbolically, substitutes values with units, checks order of magnitude, selects a realizable component or setting, and verifies ratings. It then predicts the measurement range rather than a single perfect number. Component tolerance, instrument accuracy, loading, temperature, and wiring resistance explain small differences; a large difference requires a new hypothesis.

## Datasheet and component judgment

Never select a part from its headline value alone. Check absolute maximum ratings, recommended operating conditions, typical versus guaranteed performance, temperature range, package and thermal path, frequency dependence, tolerance, lifetime or drift, and test conditions. Typical values help predict behavior; guaranteed limits decide whether a design is safe. Derate voltage, current, power, and temperature when failure has meaningful consequences.

## Common mistakes and fault evidence

A likely fault pattern is **open load, shorted resistor, incorrect reference node, nonlinear device treated as a resistor**. Do not begin by replacing parts. First reproduce the symptom safely, record supply current, divide the system into functional blocks, and measure the boundary between a known-good and suspect block. Opens usually preserve voltage on one side while preventing current; shorts collapse voltage and raise current; bias errors shift a waveform; noise and oscillation require attention to bandwidth, grounding, return paths, and probe technique.

> **Warning:** Keep course labs at extra-low voltage unless a qualified supervisor and appropriate isolated equipment are present. Never connect a bench oscilloscope ground clip to an unknown mains-referenced circuit.

## Guided practice

- Redraw the visual with reference directions and expected polarities.
- Find one real component datasheet and record three guaranteed limits plus their test conditions.
- Calculate one nominal result and one worst-case range.
- Write the exact meter or oscilloscope setup needed to test the prediction safely.
- Explain which single measurement best distinguishes open load, shorted resistor, incorrect reference node, nonlinear device treated as a resistor from a healthy circuit.

## Recap

Reliable electronics work combines a physical model, unit-aware calculation, datasheet limits, safe measurement, and evidence-based troubleshooting. Preserve all five in the engineering notebook so another person can reproduce the result.
