# GridAid

When the power goes out for days, people on home oxygen, dialysis and powered wheelchairs are in danger first. Department of Health and Human Services publishes how many live in each ZIP code. Give us a county and a budget for N backup-power centers, and we’ll compute where to put them so the most people are within reach.
GridAid is an application where it identifies backup-power centers before the next outage

---

## A Real Event
### Hurricane Beryl & Winter Strom Uri

In the past, situations such as this happened where for example back in 2024, Hurricane Beryl and Winter Storm Uri in 2021 left many people on electricity-dependent medical equipment in real danger.

## The Data

HHS emPOWER publishes de-identified counts of Medicare beneficiaries who depend on electricity-powered medical equipment, as a public REST service and a 2026 dataset on data.gov. Candidate sites (libraries, schools, community centers, fire stations) come from OpenStreetMap or public facility datasets.

## The Math

Picking N sites to cover the most people is the maximum coverage problem. It’s NP-hard, but a simple greedy algorithm is probably within a factor of (1 − 1/e) ≈ 63% of the optimum. In a small county you can also solve it exactly with integer programming and report how close greedy got. “Greedy reached 98% of the proven optimum” is a real result, and no chatbot can produce it for your county.

## GridAid Demo

Pick a county, drag a slider from 3 to 10 centers, and watch the optimizer place them and the coverage percentage rise.
