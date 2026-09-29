#!/usr/bin/env Rscript
# Reads the six CLI-exported CSV tables (docs/data-formats.md, "Outputs")
# with explicit column types, mirroring progeny-selector's
# scripts/read_results.R: every documented column is given an explicit
# readr type, so a numeric column silently parsed as character (a sign the
# contract and the reader have drifted) is caught rather than passed through.
#
# Usage: Rscript scripts/read_exports.R <summary.csv> <segments.csv> <targets.csv> <pairwise.csv> <discordant.csv> <qc.csv>
#
# Each file is read, checked for readr parse problems (readr::problems()) and
# for any column documented as numeric coming back as character; the script
# then prints a one-line row count per table and stops (nonzero exit) on the
# first failure.
suppressPackageStartupMessages(library(readr))

# NA is missing; readr's default na = c("", "NA") would also treat an empty
# cell as missing, which would be wrong for a text column that can be
# genuinely empty. None of the columns below are free text, so na = "NA"
# alone is the safe, explicit choice throughout this file (docs/adr/0016's
# reasoning for progeny-selector's results.csv applies here too). qc.csv's
# qc_flags is empty when a sample has no flag; with na = "NA" that reads as
# the empty string "", not NA, which is the documented meaning.
NA_STRING <- "NA"

stop_on_problems <- function(df, path) {
  probs <- readr::problems(df)
  if (nrow(probs) > 0) {
    print(probs)
    stop(sprintf("%s: readr reported %d parsing problem(s)", path, nrow(probs)))
  }
}

# Stops when any of `numeric_cols` was not parsed as numeric (integer or
# double): a column readr coerced to character because a cell did not match
# its declared type would otherwise pass silently.
stop_on_character_numerics <- function(df, path, numeric_cols) {
  for (col in numeric_cols) {
    if (!col %in% names(df)) next
    if (is.character(df[[col]])) {
      stop(sprintf("%s: column %s is character, expected numeric", path, col))
    }
  }
}

read_summary <- function(path) {
  fixed <- cols(
    sample_id = col_character(),
    call_set_db_id = col_character(),
    sample_db_id = col_character(),
    n_informative = col_integer(),
    n_called = col_integer(),
    n_rp_hom = col_integer(),
    n_donor_hom = col_integer(),
    n_het = col_integer(),
    n_missing = col_integer(),
    n_nonparental = col_integer(),
    rpp_count = col_double(),
    rpp_bp = col_double(),
    rpp_cm = col_double(),
    max_marker_coverage_bp = col_double(),
    max_marker_coverage_cm = col_double(),
    token_profile = col_character(),
    crop = col_character(),
    # Per-chromosome rpp_count_<chrom> columns fall between rpp_cm and
    # max_marker_coverage_bp (docs/data-formats.md, "Per-line summary CSV"); read by
    # guess, then checked below.
    .default = col_guess()
  )
  df <- readr::read_csv(path, col_types = fixed, na = NA_STRING, show_col_types = FALSE)
  stop_on_problems(df, path)
  dynamic_cols <- grep("^rpp_count_", names(df), value = TRUE)
  stop_on_character_numerics(df, path, c(
    "n_informative", "n_called", "n_rp_hom", "n_donor_hom", "n_het",
    "n_missing", "n_nonparental", "rpp_count", "rpp_bp", "rpp_cm",
    "max_marker_coverage_bp", "max_marker_coverage_cm", dynamic_cols
  ))
  df
}

read_segments <- function(path) {
  df <- readr::read_csv(
    path,
    col_types = cols(
      sample_id = col_character(),
      call_set_db_id = col_character(),
      sample_db_id = col_character(),
      chrom = col_character(),
      start_bp = col_integer(),
      end_bp = col_integer(),
      left_flank_bp = col_integer(),
      right_flank_bp = col_integer(),
      n_markers = col_integer(),
      n_donor_hom = col_integer(),
      n_het = col_integer(),
      class = col_character(),
      start_cm = col_double(),
      end_cm = col_double(),
      length_bp = col_integer(),
      length_cm = col_double(),
      gap_criterion = col_character(),
      token_profile = col_character(),
      crop = col_character()
    ),
    na = NA_STRING,
    show_col_types = FALSE
  )
  stop_on_problems(df, path)
  stop_on_character_numerics(df, path, c(
    "start_bp", "end_bp", "left_flank_bp", "right_flank_bp", "n_markers",
    "n_donor_hom", "n_het", "start_cm", "end_cm", "length_bp", "length_cm"
  ))
  df
}

read_targets <- function(path) {
  df <- readr::read_csv(
    path,
    col_types = cols(
      sample_id = col_character(),
      call_set_db_id = col_character(),
      sample_db_id = col_character(),
      target = col_character(),
      chrom = col_character(),
      start_bp = col_integer(),
      end_bp = col_integer(),
      status = col_character(),
      n_informative_in_region = col_integer(),
      segment_start_bp = col_integer(),
      segment_end_bp = col_integer(),
      drag_min_bp = col_integer(),
      drag_max_bp = col_integer(),
      token_profile = col_character(),
      crop = col_character()
    ),
    na = NA_STRING,
    show_col_types = FALSE
  )
  stop_on_problems(df, path)
  stop_on_character_numerics(df, path, c(
    "start_bp", "end_bp", "n_informative_in_region", "segment_start_bp",
    "segment_end_bp", "drag_min_bp", "drag_max_bp"
  ))
  df
}

read_pairwise <- function(path) {
  df <- readr::read_csv(
    path,
    col_types = cols(
      sample_a = col_character(),
      sample_b = col_character(),
      call_set_db_id_a = col_character(),
      sample_db_id_a = col_character(),
      call_set_db_id_b = col_character(),
      sample_db_id_b = col_character(),
      mode = col_character(),
      chrom = col_character(),
      n_compared = col_integer(),
      n_discordant = col_integer(),
      token_profile = col_character(),
      crop = col_character()
    ),
    na = NA_STRING,
    show_col_types = FALSE
  )
  stop_on_problems(df, path)
  stop_on_character_numerics(df, path, c("n_compared", "n_discordant"))
  df
}

read_discordant <- function(path) {
  df <- readr::read_csv(
    path,
    col_types = cols(
      sample_a = col_character(),
      sample_b = col_character(),
      call_set_db_id_a = col_character(),
      sample_db_id_a = col_character(),
      call_set_db_id_b = col_character(),
      sample_db_id_b = col_character(),
      marker_id = col_character(),
      chrom = col_character(),
      pos_bp = col_integer(),
      class_a = col_character(),
      class_b = col_character(),
      token_profile = col_character(),
      crop = col_character()
    ),
    na = NA_STRING,
    show_col_types = FALSE
  )
  stop_on_problems(df, path)
  stop_on_character_numerics(df, path, "pos_bp")
  df
}

read_qc <- function(path) {
  df <- readr::read_csv(
    path,
    col_types = cols(
      sample_id = col_character(),
      call_set_db_id = col_character(),
      sample_db_id = col_character(),
      role = col_character(),
      missing_rate = col_double(),
      het_rate = col_double(),
      nonparental_rate = col_double(),
      qc_flags = col_character(),
      token_profile = col_character(),
      crop = col_character()
    ),
    na = NA_STRING,
    show_col_types = FALSE
  )
  stop_on_problems(df, path)
  stop_on_character_numerics(df, path, c("missing_rate", "het_rate", "nonparental_rate"))
  df
}

main <- function(args) {
  if (length(args) != 6) {
    stop("usage: read_exports.R <summary.csv> <segments.csv> <targets.csv> <pairwise.csv> <discordant.csv> <qc.csv>")
  }
  summary_df <- read_summary(args[[1]])
  segments_df <- read_segments(args[[2]])
  targets_df <- read_targets(args[[3]])
  pairwise_df <- read_pairwise(args[[4]])
  discordant_df <- read_discordant(args[[5]])
  qc_df <- read_qc(args[[6]])

  cat(sprintf("summary: %d rows\n", nrow(summary_df)))
  cat(sprintf("segments: %d rows\n", nrow(segments_df)))
  cat(sprintf("targets: %d rows\n", nrow(targets_df)))
  cat(sprintf("pairwise: %d rows\n", nrow(pairwise_df)))
  cat(sprintf("discordant: %d rows\n", nrow(discordant_df)))
  cat(sprintf("qc: %d rows\n", nrow(qc_df)))
}

if (!interactive()) {
  main(commandArgs(trailingOnly = TRUE))
}
