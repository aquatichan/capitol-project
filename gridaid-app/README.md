# GridAid - Aaron Qin, Hardy Wang, Anay Sura, Nidheesh Pusuluri

GridAid is a computational engine that helps counties decide where to place backup-power centers in case of future outages. It was built with people who depend on home oxygen, dialysis equipment, and powered wheelchairs in mind first, who would be left without the electricity they need in case of an outage. Users select a US county, choose N centers, and set a coverage radius in miles. The app then optimizes site placement and displays the results on an interactive map.

## Motivation

Aaron and Anay are from Texas; together, they experienced the worst impacts of Winter Storm Uri (2021) and Hurricane Beryl (2024), which left parts of the Austin and Houston areas without power for many days. Especially for people who rely on powered medical equipment or live in rural, underfunded areas, these outages can be especially dangerous. That's where GridAid comes in–our purpose is to form the utility for civilians and city planners alike, helping plan where to place limited backup-power resources using public data on Medicare beneficiaries (data from HHS emPOWER).

## Flow:

1. Select a county and the number of centers.
2. Load ZIP-level health data from HHS emPOWER.
3. Identify candidate sites such as libraries, schools, and fire stations.
4. Use a maximum coverage algorithm to select locations.
5. View covered and uncovered ZIP areas on the map.

## Technical Complexity

GridAid associates with the **maximum coverage problem**, an NP-hard problem involving the selection of a fixed number of sites.

- **Greedy:** Selects the site that reaches the most people not yet covered–it has a theoretical guarantee of at least 63.2% of optimal coverage under standard assumptions.
- **Exact optimization:** Uses integer programming with the PuLP library to find an optimal solution when solved to completion.
- **Comparison:** Measures the difference between the greedy and exact solutions.
- **and more...**

## Logistics Page

The second page is more in-depth and lets planners actually read, tinker with, and review the proposed plans.

- Move, add, or remove sites and change coverage radii.
- Set budgets and generator types.
- Compare planning methods and search algorithms.
- View site details, power requirements, contact information, and verification flags.
- Compare generator costs and timelines.
- Save checklists and generate briefing or petition PDFs.
- Ask embedded Gemini assistant about current outages and storms.

## Data Sources

| Data | Source |
|---|---|
| Medical equipment dependence | [HHS emPOWER](https://empowermap.hhs.gov/) and [Data.gov](https://data.gov/) |
| Candidate facilities | [OpenStreetMap](https://www.openstreetmap.org/) and public datasets |
| ZIP boundaries | [US Census Bureau](https://www2.census.gov/geo/tiger/GENZ2020/shp/cb_2020_us_zcta520_500k.zip) |
| Basemap | Esri World Light Gray Canvas |

## Limitations

- Coverage uses straight-line distance, not road travel time.
- The selected radius may overestimate how far people can travel during an emergency.
- emPOWER covers Medicare beneficiaries, so other equipment-dependent residents will be undercounted.
- Residents are represented by ZIP-level points rather than individual locations.
- Candidate facilities are not verified for capacity, accessibility, staffing, or participation.
- Medical-category breakdowns on the logistics page are estimates based on county-level proportions.
