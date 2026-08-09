# You brought the dataset "Pets" into CODAP. In R, read.csv() loads the same data (the case_id column identifies each case).
pets <- read.csv("pets.csv")

# You created "double_count" with the formula count * 2. mutate() computes a new column the same way.
pets <- pets |>
  mutate(double_count = count * 2)

# You deleted 1 case. filter() keeps every case that is NOT one of the deleted ones.
pets <- pets |>
  filter(!(case_id %in% 3))

# You renamed "animal" to "species". rename() takes new_name = old_name.
pets <- pets |>
  rename(species = animal)

# You grouped "Pets" by "species" — that's what your nested table shows. group_by() is R's version of the same idea.
pets <- pets |>
  ungroup() |>
  group_by(species)

# You moved the slider "scale" to 2.5. In R that's just assigning a value.
scale <- 2.5
