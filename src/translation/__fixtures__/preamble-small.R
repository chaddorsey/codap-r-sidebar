# Setup: load the tidyverse packages this script uses. This section recreates what was already in your CODAP document.
library(dplyr)

# Setup: the dataset "Mammals" (2 cases) written out as a tribble — a small table typed directly in R. case_id identifies each CODAP case.
mammals <- tribble(
  ~case_id, ~diet, ~species, ~mass, ~weird,
  10, "meat", "lion", 190, 4.2,
  11, "plants", "zebra", 380, 3.1
)

# Setup: "logMass" is computed from the formula ln(mass), recreated with mutate().
mammals <- mammals |>
  mutate(logMass = log(mass))

# Setup: "weird" has a CODAP formula R can't express yet; its values are loaded as data.
# "weird" is computed in CODAP with the formula: lookupByKey(x, y, z)
# We couldn't translate that formula to R yet, so its values come from the data file.

# Setup: your table is grouped by "diet" — group_by() recreates the nested table structure.
mammals <- mammals |>
  group_by(diet)
