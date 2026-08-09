# You brought the dataset "Pets" into CODAP. In R, read.csv() loads the same data (the case_id column identifies each case).
pets <- read.csv("pets.csv")

# You made a new graph. ggplot() starts an empty plot connected to the data.
p1 <- ggplot(pets)
p1

# You put "count" on the x-axis. geom_dotplot() stacks a dot for each case along the axis.
p1 <- ggplot(pets) +
  aes(x = count) +
  geom_dotplot()
p1

# You put "size" on the y-axis. geom_point() draws a point for each case — a scatter plot.
p1 <- ggplot(pets) +
  aes(x = count, y = size) +
  geom_point()
p1

# You colored the graph by "animal". aes() maps attributes to parts of the plot.
p1 <- p1 + aes(color = animal)
p1

# You added a least-squares line. geom_smooth(method = "lm") fits and draws the same regression line.
p1 <- p1 + geom_smooth(method = "lm", se = FALSE)
p1
