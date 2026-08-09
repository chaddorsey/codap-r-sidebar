# Builds the self-hosted webR package library image for classroom deployment
# (plan Unit 5/9): one HTTP-cacheable library.data file mounted by webR via
# webr::mount(), replacing per-package downloads from repo.r-wasm.org.
#
# Prerequisites (CI: r-lib/actions/setup-r + pak):
#   install.packages("rwasm", repos = c("https://r-wasm.r-universe.dev", "https://cloud.r-project.org"))
#
# IMPORTANT: the rwasm/webR toolchain version must match the webr npm package
# version in package.json — wasm binaries are ABI-locked to the webR release.
#
# Usage: Rscript scripts/build-library-image/build.R <output-dir>

args <- commandArgs(trailingOnly = TRUE)
out_dir <- if (length(args) >= 1) args[[1]] else "dist/webr-library"

# Keep in sync with kRPackages in src/services/webr-service.ts.
packages <- c("dplyr", "ggplot2", "tidyr")

dir.create(out_dir, recursive = TRUE, showWarnings = FALSE)
rwasm::add_pkg(packages)
rwasm::make_vfs_library(compress = TRUE, out_dir = out_dir)

cat("Library image written to", out_dir, "\n")
cat("Deploy alongside the plugin with CORS (Access-Control-Allow-Origin: *)\n")
cat("and mount it at boot with webr::mount('/library', <url>/library.data.gz).\n")
