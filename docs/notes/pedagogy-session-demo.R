# Setup: load the tidyverse packages this script uses. This section recreates what was already in your CODAP document.
library(dplyr)
library(ggplot2)

# Setup: the dataset "Mammals" (8 cases) written out as a tribble — a small table typed directly in R. case_id identifies each CODAP case.
mammals <- tribble(
  ~case_id, ~species, ~diet, ~mass, ~sleep_hours,
  1, "lion", "meat", 190, 13.5,
  2, "zebra", "plants", 380, 4.4,
  3, "house cat", "meat", 4.5, 12.5,
  4, "elephant", "plants", 5400, 3.5,
  5, "bat", "insects", 0.02, 19.9,
  6, "human", "both", 62, 8,
  7, "dolphin", "fish", 150, 10.4,
  8, "giraffe", "plants", 900, 1.9
)

# You created "log_mass" with the formula log(mass). mutate() computes a new column the same way.
mammals <- mammals |>
  mutate(log_mass = log10(mass))

# You changed the formula for "log_mass" to ln(mass). mutate() recomputes the column.
mammals <- mammals |>
  mutate(log_mass = log(mass))

# You deleted 1 case. filter() keeps every case that is NOT one of the deleted ones.
mammals <- mammals |>
  filter(!(case_id %in% 4))

# You grouped "Mammals" by "diet" — that's what your nested table shows. group_by() is R's version of the same idea.
mammals <- mammals |>
  ungroup() |>
  group_by(diet)

# You made a new graph. ggplot() starts an empty plot connected to the data.
p1 <- ggplot(mammals)
p1

# You put "sleep_hours" on the x-axis. geom_dotplot() stacks a dot for each case along the axis.
p1 <- ggplot(mammals) +
  aes(x = sleep_hours) +
  geom_dotplot()
p1

# You put "log_mass" on the y-axis. geom_point() draws a point for each case — a scatter plot.
p1 <- ggplot(mammals) +
  aes(x = sleep_hours, y = log_mass) +
  geom_point()
p1

# You colored the graph by "diet". aes() maps attributes to parts of the plot.
p1 <- p1 + aes(color = diet)
p1

# You added a least-squares line. geom_smooth(method = "lm") fits and draws the same regression line.
p1 <- p1 + geom_smooth(method = "lm", se = FALSE)
p1

# You added a movable value to the graph — R can't express this one yet.
# You added a movable value to the graph.
# We can't translate this graph element to R yet.

# You renamed "sleep_hours" to "sleep". rename() takes new_name = old_name.
mammals <- mammals |>
  rename(sleep = sleep_hours)

# You made a new graph. ggplot() starts an empty plot connected to the data.
p2 <- ggplot(mammals)
p2

# You put "sleep" on the x-axis. geom_dotplot() stacks a dot for each case along the axis.
p2 <- ggplot(mammals) +
  aes(x = sleep) +
  geom_dotplot()
p2

# You added the mean of "sleep" to the graph. geom_vline() draws it as a line at mean(sleep).
p2 <- p2 + geom_vline(aes(xintercept = mean(sleep)))
p2
