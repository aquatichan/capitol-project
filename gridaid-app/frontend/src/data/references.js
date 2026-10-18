// Every source GridAid relies on, in APA 7th edition. *asterisks* mark italics (rendered by <Apa>, stripped in PDFs).
// Titles were checked against the live page or Crossref on Oct. 17, 2026. Where a page blocks automated reading and
// its title could not be confirmed, a bracketed description stands in for the title, as APA allows.

export const REFS = {
  // ---- data ----
  empower: { apa: "U.S. Department of Health and Human Services, Administration for Strategic Preparedness and Response. (2026). *HHS emPOWER REST service* [Data set]. ArcGIS Online.", url: "https://services2.arcgis.com/ZQ4jTQn6k7VPXEwO/ArcGIS/rest/services/HHS_emPOWER_REST_Service_Public/FeatureServer", use: "People who rely on electricity-powered medical equipment, by county and ZIP (Medicare only, counts of 1 to 10 shown as 11)." },
  zcta: { apa: "U.S. Census Bureau. (n.d.). *2020 cartographic boundary files: ZIP Code Tabulation Areas, 1:500,000* [Data set].", url: "https://www.census.gov/geographies/mapping-files/time-series/geo/cartographic-boundary.2020.html", use: "ZIP boundaries on the maps." },
  osm: { apa: "OpenStreetMap contributors. (2026). *OpenStreetMap* [Data set]. OpenStreetMap Foundation. Retrieved October 17, 2026.", url: "https://www.openstreetmap.org/copyright", use: "Libraries, schools, community centers, and fire stations, and any phone or address listed on them." },
  acpl: { apa: "Athens County Public Libraries. (n.d.). *Athens County Public Libraries*.", url: "https://www.myacpl.org", use: "Branch list for the Athens County plan." },

  // ---- costs and equipment ----
  ncdps: { apa: "North Carolina Department of Public Safety. (2019, June 18). *Communities to receive generators for powering critical public infrastructure* [Press release].", url: "https://www.ncdps.gov/news/press-releases/2019/06/18/communities-receive-generators-powering-critical-public", use: "About $58,333 per permanent generator ($1.4 million for 24); FEMA paid 75%." },
  njoem: { apa: "New Jersey Office of Emergency Management. (2014). *Hazard Mitigation Grant Program permissible uses list*.", url: "https://nj.gov/njoem/programs/pdf/hmgp/062414_hmgp_permlist.pdf", use: "Quick-connect (hookup) box about $100 per kW; permanent generator $450 to $650 per kW." },
  oregon: { apa: "Oregon Department of Energy. (2026, February 5). *Oregon Department of Energy grants support renewable and resilient energy development from Canyonville to Cascade Locks*. Energy Info.", url: "https://energyinfo.oregon.gov/blog/2026/2/5/oregon-department-of-energy-grants-support-renewable-and-resilient-energy-development-from-canyonville-to-cascade-locks", use: "Solar plus battery cost: $589,147 for a library emergency site." },
  santafe: { apa: "City of Santa Fe, Texas. (2026, May). [City council packet with Runge Park Community Center generator quote].", url: "https://www.santafetx.gov/media/17821", use: "Natural gas generator quote, 40 kW, $39,465. The packet link returned 404 on Oct. 17, 2026.", dead: true },
  stow: { apa: "Citizen Portal. (2026, August 6). *Committee amends generator funding line and advances community center generator to council*.", url: "https://citizenportal.ai/articles/10770385/ohio/summit-county/stow-city/committee-amends-generator-funding-line-and-advances-community-center-generator-to-council", use: "Natural gas generator, 80 kW, $88,500 (Stow, Ohio)." },
  wuft: { apa: "Suwannee County approves purchase of $600,000 generator for emergency shelter. (2026, February 3). *WUFT*.", url: "https://www.wuft.org/politics/2026-02-03/suwannee-county-approves-purchase-of-600-000-generator-for-emergency-shelter", use: "A whole-school shelter generator: $606,291 for equipment alone." },
  vandalia: { apa: "Vandalia Rental. (n.d.). *Generator-100 kW - 3 phase*.", url: "https://vandaliarental.com/equipment/generator-100-kw-3-phase/", use: "Renting a 100 kW generator: $1,569 per week." },
  herc: { apa: "Herc Rentals. (n.d.). *How to calculate diesel generator fuel consumption*.", url: "https://blog.hercrentals.com/power-generation/how-to-calculate-diesel-generator-fuel-consumption/", use: "A 100 kW diesel generator at full load burns about 7.4 gallons an hour." },
  generac: { apa: "Generac Power Systems. (n.d.). *QT10054GNSN owner's manual* [Manual]. Notice-Facile.", url: "https://www.notice-facile.com/en/manual/1523359/generac+qt10054gnsn", use: "Natural gas use: 1,374 cubic feet an hour at full load." },
  eiaDiesel: { apa: "U.S. Energy Information Administration. (2026). *Gasoline and diesel fuel update*. Retrieved October 12, 2026.", url: "https://www.eia.gov/petroleum/gasdiesel/", use: "Diesel retail price." },
  eiaGas: { apa: "U.S. Energy Information Administration. (2026). *U.S. price of natural gas sold to commercial consumers* [Data set].", url: "https://www.eia.gov/dnav/ng/hist/n3020us3m.htm", use: "Commercial natural gas price." },
  inogen: { apa: "Inogen. (n.d.). *Inogen At Home energy savings calculator*.", url: "https://www.inogen.com/products/energy-savings-calculator/", use: "An oxygen concentrator draws about 275 W; many draw twice that." },
  fema: { apa: "Federal Emergency Management Agency. (n.d.). *Hazard Mitigation Grant Program*.", url: "https://www.fema.gov/grants/mitigation/hazard-mitigation", use: "The federal grant that pays up to 75% of eligible generator projects." },

  // ---- methods ----
  church: { apa: "Church, R., & ReVelle, C. (1974). The maximal covering location problem. *Papers of the Regional Science Association, 32*(1), 101–118.", url: "https://doi.org/10.1007/BF01942293", use: "The problem GridAid solves: put k sites where the most people are within reach." },
  nemhauser: { apa: "Nemhauser, G. L., Wolsey, L. A., & Fisher, M. L. (1978). An analysis of approximations for maximizing submodular set functions—I. *Mathematical Programming, 14*(1), 265–294.", url: "https://doi.org/10.1007/BF01588971", use: "Why greedy is always at least 63% of the best possible plan." },
  khuller: { apa: "Khuller, S., Moss, A., & Naor, J. (1999). The budgeted maximum coverage problem. *Information Processing Letters, 70*(1), 39–45.", url: "https://doi.org/10.1016/S0020-0190(99)00031-9", use: "The same problem when sites cost different amounts." },
  leskovec: { apa: "Leskovec, J., Krause, A., Guestrin, C., Faloutsos, C., VanBriesen, J., & Glance, N. (2007). Cost-effective outbreak detection in networks. In *Proceedings of the 13th ACM SIGKDD International Conference on Knowledge Discovery and Data Mining* (pp. 420–429). ACM.", url: "https://doi.org/10.1145/1281192.1281239", use: "Lazy greedy (CELF)." },
  lowerre: { apa: "Lowerre, B. T. (1976). *The HARPY speech recognition system* [Doctoral dissertation, Carnegie Mellon University].", url: null, use: "Beam search." },
  kirkpatrick: { apa: "Kirkpatrick, S., Gelatt, C. D., & Vecchi, M. P. (1983). Optimization by simulated annealing. *Science, 220*(4598), 671–680.", url: "https://doi.org/10.1126/science.220.4598.671", use: "Simulated annealing." },
  holland: { apa: "Holland, J. H. (1975). *Adaptation in natural and artificial systems*. University of Michigan Press.", url: null, use: "Genetic algorithms." },
  landdoig: { apa: "Land, A. H., & Doig, A. G. (1960). An automatic method of solving discrete programming problems. *Econometrica, 28*(3), 497–520.", url: "https://doi.org/10.2307/1910129", use: "Branch and bound." },
  highs: { apa: "Huangfu, Q., & Hall, J. A. J. (2018). Parallelizing the dual revised simplex method. *Mathematical Programming Computation, 10*(1), 119–142.", url: "https://doi.org/10.1007/s12532-017-0130-5", use: "HiGHS, the solver behind the exact plans." },

  // ---- recent outages, one per workbook county (titles in brackets could not be read automatically) ----
  out06037: { apa: "Patch. (2025, January 8). [Report on Southern California Edison public safety power shutoffs in Los Angeles County during the January 2025 wildfires].", url: "https://patch.com/california/los-angeles/140k-lose-electricity-public-safety-power-shutoffs-amid-fires" },
  out17031: { apa: "ComEd. (2024, July 17). [Press release on restoring power after the July 15, 2024 tornado outbreak]. Business Wire.", url: "https://www.businesswire.com/news/home/20240717251696/en" },
  out48201: { apa: "Axios Houston. (2024, July 11). [Report on CenterPoint outages after Hurricane Beryl].", url: "https://www.axios.com/local/houston/2024/07/11/houston-power-outage-storm-beryl-centerpoint" },
  out04013: { apa: "Axios Phoenix. (2023, May 24). [Report on a Georgia Tech study of a heat-wave blackout in Phoenix].", url: "https://www.axios.com/local/phoenix/2023/05/24/heat-wave-black-out-phoenx-heat-deaths-hospital" },
  out12086: { apa: "Power out for more than 60 percent of Florida homes and businesses. (2017, September 11). *GBH News*.", url: "https://www.wgbh.org/news/2017-09-11/power-out-for-more-than-60-percent-of-florida-homes-and-businesses" },
  out39009: { apa: "AEP says restoring power could take 5 to 7 days. (2012, June 30). *WOUB Public Media*.", url: "https://woub.org/2012/06/30/aep-says-restoring-power-could-take-5-7-days/" },
  out21095: { apa: "Harlan County power outage update. (2024, September 30). *WYMT*.", url: "https://www.wymt.com/2024/09/30/harlan-county-power-outage-update/" },
  out33007: { apa: "UPDATE: N.H. sees widespread damage from severe wind, rainstorm. (2017, October 30). *New Hampshire Public Radio*.", url: "https://www.nhpr.org/nh-news/2017-10-30/update-n-h-sees-widespread-damage-from-severe-wind-rainstorm" },
  out30003: { apa: "National Weather Service. (n.d.). *June 11, 2022 destructive winds in Hardin, MT*.", url: "https://www.weather.gov/byz/June-11-2022-Hardin-Downburst" },
  out28133: { apa: "More than 140,000 still without power in MS. When will power come on? (2026, January). *Yahoo News*.", url: "https://www.yahoo.com/news/articles/nearly-140-000-still-without-160954894.html" },
};

export const SOURCE_GROUPS = [
  ["Data", ["empower", "zcta", "osm", "acpl"]],
  ["Costs and equipment", ["ncdps", "fema", "njoem", "vandalia", "herc", "eiaDiesel", "stow", "santafe", "generac", "eiaGas", "oregon", "wuft", "inogen"]],
  ["How plans are chosen", ["church", "nemhauser", "khuller", "leskovec", "lowerre", "kirkpatrick", "holland", "landdoig", "highs"]],
];

// What other research says, beyond the data GridAid uses. Each finding is from the paper's own abstract or summary.
export const RESEARCH = [
  { ref: "molinari", finding: "In 2012, about 366,600 people with employer insurance lived at home on electricity-dependent medical equipment, 218 in every 100,000. emPOWER counts only Medicare members, so the real number in any county is higher than this map shows." },
  { ref: "dshs", finding: "Texas confirmed 246 deaths from the February 2021 winter storm, across 77 counties. Some followed disrupted dialysis or oxygen treatment, or loss of power to equipment needed to stay alive." },
  { ref: "dominianni", finding: "In New York City, the 2003 blackout was linked to more hospital stays for breathing and kidney disease, and cold-weather local outages to more deaths overall." },
  { ref: "stone", finding: "A multiday blackout during a heat wave more than doubled estimated heat deaths in three large U.S. cities, and would send 3% (Atlanta) to over 50% (Phoenix) of residents for medical care." },
  { ref: "casey", finding: "A review of 50 studies links outages to carbon monoxide poisoning, heat and cold illness, and heart, lung, and kidney hospitalizations, especially for people who rely on powered medical equipment." },
];
