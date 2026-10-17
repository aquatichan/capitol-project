# GridAid

**Where should a county put backup-power centers before the next outage?**

When the power goes out for days, people who depend on home oxygen, dialysis, and powered wheelchairs are in danger first. GridAid takes a US county and a budget for *N* backup-power centers, then computes where to place them so the most electricity-dependent residents are within reach.

Built for the Congressional App Challenge.

> **GridAid is planning support, not a safety guarantee.** It helps answer "where should a county plan to put centers?" It does not tell anyone "you will be safe here."

---

## Why this matters

- **Winter Storm Uri (2021)** and **Hurricane Beryl (2024)** left Houston-area residents without power for days, including people on electricity-powered medical equipment.
- Emergency managers have to decide where limited generators, batteries, and staff go. Today that often relies on intuition.
- The data to do better is already public. It just hasn't been turned into a placement tool anyone can use.

## How it works

1. **Pick a county** and a number of centers (*N*, from 3 to 10 with a slider).
2. GridAid loads **ZIP-level counts** of Medicare beneficiaries who rely on electricity-dependent medical equipment (HHS emPOWER).
3. It loads **candidate sites** (libraries, schools, community centers, fire stations) from OpenStreetMap or public facility datasets.
4. A **maximum coverage optimizer** chooses the *N* sites that put the most people within a chosen radius.
5. The map shows the chosen sites, the covered and uncovered ZIPs, and a live **coverage meter** that updates as you move the slider.

## The algorithm

Choosing *N* sites to cover the most people is the **maximum coverage problem**, which is NP-hard.

- **Greedy:** repeatedly pick the site that covers the most not-yet-covered people. It is fast, and it is mathematically guaranteed to reach at least **(1 − 1/e) ≈ 63%** of the best possible coverage. In practice it usually does much better.
- **Exact (integer programming):** for a county, we also solve the problem to proven optimality using integer programming ([PuLP](https://coin-or.github.io/pulp/)).
- **Comparison:** we report how close greedy gets to the proven optimum.

## Data sources

| Data | Source |
| People dependent on electricity-powered medical equipment, by ZIP | [HHS emPOWER](https://empowermap.hhs.gov/) public REST service and the emPOWER dataset on [data.gov](https://data.gov) |
| Candidate sites (libraries, schools, community centers, fire stations) | [OpenStreetMap](https://www.openstreetmap.org/) or public facility datasets |
| County and ZIP boundaries | US Census Bureau |

All data is public. If the API is unavailable, the app falls back to the downloadable dataset.

## Assumptions and limitations

We state these plainly because a planning tool should never overpromise.

- **Straight-line radius, not travel time.** "Within reach" currently means within a fixed straight-line distance of a site. Real travel depends on roads, flooding, and traffic. Road-network distance is planned future work.
- **Mobility matters.** People who use powered wheelchairs or oxygen equipment can't always travel far, especially during a storm. Coverage radii should be treated as optimistic.
- **Medicare beneficiaries only.** emPOWER counts Medicare enrollees, so younger people and others on electricity-dependent equipment are undercounted.
- **ZIP-level resolution.** People are treated as located at the ZIP's representative point, not at specific addresses.
- **Candidate sites aren't verified.** A site on the map has not been checked for generator capacity, accessibility, staffing, or willingness to participate.
- **Small counts are suppressed** in the source data, so very small ZIPs may be undercounted or missing.

## Privacy

GridAid uses **only aggregate, de-identified data**. It never attempts to identify, locate, or infer information about any individual, and it must not be extended to do so.

## Getting started

```bash
git clone https://github.com/<your-org>/gridaid.git
cd gridaid
pip install -r requirements.txt
python scripts/load_data.py --county "Harris County, TX"
python app.py
```

Then open the local address shown in your terminal, choose a county, and drag the slider.

*(Adjust commands to match your actual project structure before submitting.)*

## Project structure

```
gridaid/
├── data/          # downloaded and cached emPOWER + facility data
├── optimizer/     # greedy and integer-programming solvers
├── app/           # front end: map, county picker, N slider, coverage meter
├── notebooks/     # greedy vs. optimal comparison
└── README.md
```

## Roadmap

- Road-network travel time instead of straight-line radius
- Weighting sites by capacity or accessibility
- Flood-risk layers to exclude sites likely to be inaccessible
- Feedback from county emergency managers

## License

Open source under the [MIT License](LICENSE). *(Swap in your chosen license.)*

## Acknowledgments

- HHS emPOWER Program for publishing de-identified data
- OpenStreetMap contributors
- Congressional App Challenge
- Hack Club's Capitol
