# Power, Energy, and Thermal Basics: physical model and vocabulary

## Why this matters

close the electrical and thermal budgets together rather than treating rated power as a target. In real electronics, a correct equation is only the beginning: the model must match the operating region, ratings, tolerances, measurement method, and failure conditions. This lesson connects the physical idea to a repeatable engineering workflow.

![Power, Energy, and Thermal Basics: physical model and vocabulary concept diagram](assets/diagrams/m04-overview.svg "Module 4 visual model: Power, Energy, and Thermal Basics: physical model and vocabulary")

## Learning objectives

- Explain P=VI, I²R, V²/R, efficiency in physical and circuit terms.
- Identify the reference directions, units, assumptions, and validity limits of the model.
- Read the relevant graph, table, pin description, or rating in a component datasheet.
- Predict what a safe bench measurement should show and how the instrument may affect it.
- Recognize the characteristic evidence of overloaded resistor, inadequate copper area, missing derating, optimistic efficiency.

## Core model

The central rule for this module is to **close the electrical and thermal budgets together rather than treating rated power as a target**. Begin by drawing the complete current path and naming every reference node. Mark known values with units, distinguish nominal values from limits, and state which effects are intentionally neglected. A model is useful only when its assumptions are visible.

The key vocabulary for this lesson is **P=VI**, **I²R**, **V²/R**, **efficiency**. Treat each term as a measurable property rather than a word to memorize. Ask what produces it, where it is measured, what changes it, and which datasheet limit constrains it. When two descriptions appear to conflict, check whether they refer to different frequency, temperature, bias, time scale, or reference direction.

## Physical interpretation

Build intuition before algebra. For each of **P=VI**, **I²R**, **V²/R**, **efficiency**, identify what physically stores, transports, converts, or limits energy. State the relevant direction and reference: voltage exists between two nodes, current crosses a boundary, and impedance depends on frequency. A schematic symbol is a model, not the object itself; package parasitics, temperature, bias, and construction determine where that model stops being accurate.

Create a units table and dimensional check. Sketch limiting cases at zero, very small, nominal, and very large input. Limiting cases expose sign errors and impossible results before a bench test does.

## Engineering workflow

1. De-energize the circuit and inspect polarity, ratings, wiring, and likely stored energy.
2. Draw a simplified model that contains the source, return path, load, and measurement connection.
3. Select equations from the model and carry units through every step.
4. Calculate nominal and worst-case values using tolerances and operating limits.
5. Predict at least two observable quantities before powering the circuit.
6. Apply a conservative current limit and measure from the source outward.
7. Compare evidence with prediction; revise one assumption at a time.

## Worked example

Estimate junction temperature for a device dissipating 1.2 W with 45 °C/W junction-to-ambient at 30 °C ambient.

### Reference resolution

Temperature rise is 1.2 W × 45 °C/W = 54 °C. At 30 °C ambient the estimated junction temperature is 84 °C. This is acceptable only if it remains below the recommended operating limit with interface and airflow uncertainty; absolute maximum junction temperature is not a design target.

A defensible solution identifies the unknown, writes the governing relationship symbolically, substitutes values with units, checks order of magnitude, selects a realizable component or setting, and verifies ratings. It then predicts the measurement range rather than a single perfect number. Component tolerance, instrument accuracy, loading, temperature, and wiring resistance explain small differences; a large difference requires a new hypothesis.

## Datasheet and component judgment

Never select a part from its headline value alone. Check absolute maximum ratings, recommended operating conditions, typical versus guaranteed performance, temperature range, package and thermal path, frequency dependence, tolerance, lifetime or drift, and test conditions. Typical values help predict behavior; guaranteed limits decide whether a design is safe. Derate voltage, current, power, and temperature when failure has meaningful consequences.

## Common mistakes and fault evidence

A likely fault pattern is **overloaded resistor, inadequate copper area, missing derating, optimistic efficiency**. Do not begin by replacing parts. First reproduce the symptom safely, record supply current, divide the system into functional blocks, and measure the boundary between a known-good and suspect block. Opens usually preserve voltage on one side while preventing current; shorts collapse voltage and raise current; bias errors shift a waveform; noise and oscillation require attention to bandwidth, grounding, return paths, and probe technique.

> **Warning:** Keep course labs at extra-low voltage unless a qualified supervisor and appropriate isolated equipment are present. Never connect a bench oscilloscope ground clip to an unknown mains-referenced circuit.

## Guided practice

- Redraw the visual with reference directions and expected polarities.
- Find one real component datasheet and record three guaranteed limits plus their test conditions.
- Calculate one nominal result and one worst-case range.
- Write the exact meter or oscilloscope setup needed to test the prediction safely.
- Explain which single measurement best distinguishes overloaded resistor, inadequate copper area, missing derating, optimistic efficiency from a healthy circuit.

## Recap

Reliable electronics work combines a physical model, unit-aware calculation, datasheet limits, safe measurement, and evidence-based troubleshooting. Preserve all five in the engineering notebook so another person can reproduce the result.
