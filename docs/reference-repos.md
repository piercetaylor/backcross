# Reference repositories

Every repository below was fetched on 2026-09-04 at the URL given; facts are as reported by the fetched page. Nothing was copied from any of them; what was borrowed is definitions, conventions and layout.

## cropgeeks/flapjack

URL: https://github.com/cropgeeks/flapjack (fetched). Licence: BSD-2-Clause. Language: Java; Ant build; GitHub Actions in .github/workflows; tests/ directory; docs on Read the Docs. Desktop application for interactive visualisation of high-throughput genotype data, including a marker-assisted backcrossing analysis documented at https://flapjack.hutton.ac.uk/en/latest/mabc.html (fetched) and a tutorial at https://flapjack.hutton.ac.uk/en/latest/mabc_tutorial.html (fetched). Borrowed: the weighted RPP model (each marker represents at most a user-set coverage, half per side; heterozygous calls weigh 0.5), the linkage-drag definition (distance to the first recombination on each side of the QTL region, or to the chromosome end), and the output-table idea of per-chromosome RPP plus total. Not borrowed: the Java desktop architecture, its native file formats, the requirement to install a JRE.

## cropgeeks/flapjack-bytes

URL: https://github.com/cropgeeks/flapjack-bytes (fetched). Licence: BSD-2-Clause. Language: JavaScript; Rollup build, Babel, ESLint; test/ and sample-data/ directories; no CI file visible. HTML5 canvas graphical-genotype visualisation library modelled on Flapjack, loading from BrAPI, local files or URLs, with colouring by state or by similarity to a reference line. Borrowed: canvas rendering with a retained data model, the "colour by similarity to line" idea, and the plan to load from BrAPI later. Not borrowed: its build chain (Rollup/Babel) and untyped JavaScript; this project uses Vite and strict TypeScript.

## plantbreeding/BrAPI (BrAPI specification)

URL: https://github.com/plantbreeding/BrAPI (fetched 2026-09-15; the former plantbreeding/API paths return 404). Licence: MIT. Specification repository for the Breeding API; V2.1 (2022) with Core, Phenotyping, Genotyping and Germplasm modules; Genotyping covers samples, markers, variant sets, variants, call sets, calls. The Variant schema (`Specification/BrAPI-Genotyping/Variants/Schemas/Variant.yaml`, branch brapi-V2.1) gives `start` as 0-based and `variantNames` as human-readable names. Responses from test-server.brapi.org were checked on 2026-09-12 and 2026-09-15 (docs/adr/0015 records its `/variants` paging). Borrowed: the Genotyping vocabulary and the `/allelematrix` paging model for the loader in `src/io/brapi.ts`. Not borrowed: code.

## Breeding-Insight (organisation)

URL: https://github.com/Breeding-Insight (fetched). Repositories include bi-web (TypeScript, Apache-2.0), bi-api (Java, Apache-2.0), brapi (Java, Apache-2.0), plus R tools such as deltabreedquery and familia (Shiny). Borrowed: confirmation that a TypeScript front end with a typed API is the norm in current public-sector breeding software, and the pattern of R helper packages that pull data into Shiny. Not borrowed: the server-side architecture; this project has no server.

## zhengxwen/SNPRelate

URL: https://github.com/zhengxwen/SNPRelate (fetched). Licence: GPL-3. Language: R with C/C++ kernels; Bioconductor package; GitHub Actions; tests/, vignettes/. IBS definition from the snpgdsIBS manual page, https://rdrr.io/bioc/SNPRelate/man/snpgdsIBS.html (fetched): the average over SNPs of 1 − |g1 − g2| / 2. Borrowed: this IBS definition (expressed as shared alleles / 2 per marker). Not borrowed: any code (GPL-3 would make a derivative GPL); the definition is a formula.

## cggh/scikit-allel

URL: https://github.com/cggh/scikit-allel (fetched). Licence: MIT. Language: Python; allel/ package, docs/, notebooks/; pytest; Travis/AppVeyor; PyPI. Maintenance-only, successor sgkit. Distance documentation at https://scikit-allel.readthedocs.io/en/stable/stats/distance.html (fetched): pairwise_distance over genotype allele counts with scipy metrics. Borrowed: the package/docs/tests separation and the idea of computing distances on allele-count encodings. Not borrowed: code.

## knausb/vcfR

URL: https://github.com/knausb/vcfR (fetched). Language: R with Rcpp; CRAN package; GitHub Actions R-CMD-check, AppVeyor, Coveralls; vignettes. Licence GPL-3 per the DESCRIPTION file, https://github.com/knausb/vcfR/blob/master/DESCRIPTION (fetched). Borrowed: the expectation that downstream R users will read exported CSVs rather than VCF, and the convention of keeping fixed columns and genotype matrix separate. Not borrowed: code (GPL-3).

## SouthGreenPlatform/Gigwa2

URL: https://github.com/SouthGreenPlatform/Gigwa2 (fetched; the cropgeeks-style path https://github.com/SouthGreen/Gigwa2 returned 404). Licence: AGPL-3.0. Language: JavaScript and Java; Maven build; Dockerfile and docker-compose; GitHub Actions; test/ directory; wiki documentation. Server application over MongoDB for filtering large genotyping datasets, importing VCF and HapMap among others, exposing BrAPI, and visualising with IGV.js and flapjack-bytes. Borrowed: confirmation that VCF and HapMap are the two formats a breeding-genotyping tool must read, and the choice of flapjack-bytes-style rendering for genotype previews. Not borrowed: the server and database (out of scope; AGPL would also constrain reuse).

## germinateplatform/germinate and germinate-vue

URLs: https://github.com/germinateplatform/germinate (fetched; archived read-only on 2021-08-24, Apache-2.0, Java, Ant) and https://github.com/germinateplatform/germinate-vue (fetched; active, Apache-2.0, JavaScript/Vue, npm, GitHub Actions Docker workflows, docs at germinateplatform.github.io/germinate-server). Plant genetic-resources database with links to Flapjack for graphical genotyping. Borrowed: nothing beyond the observation that graphical genotyping is delegated to Flapjack/flapjack-bytes rather than reimplemented. Not borrowed: the database platform.

## GMOD/jbrowse-components (JBrowse 2)

URL: https://github.com/GMOD/jbrowse-components (fetched). Licence: Apache-2.0. Language: TypeScript with React; pnpm monorepo (packages/, plugins/, products/); Jest; GitHub Actions; docs at jbrowse.org/jb2/docs and an architecture document in the repository. Client-side genome browser deployable as a static web app with no server. Borrowed: the precedent for a fully client-side TypeScript genomics application, strict TypeScript, and the separation of pure data-model packages from React products. Not borrowed: the plugin architecture and monorepo tooling, which are disproportionate for one application.

## GGT 2.0 (graphical genotypes)

Publication only; no repository was found. van Berloo 1999, Journal of Heredity 90:328–329, DOI 10.1093/jhered/90.2.328, https://academic.oup.com/jhered/article/90/2/328/875967 (fetched), and van Berloo 2008, "GGT 2.0: versatile software for visualization and analysis of genetic data", Journal of Heredity 99:232–236, DOI 10.1093/jhered/esm109, https://academic.oup.com/jhered/article-abstract/99/2/232/2188147 (fetched). The abstract describes freely available Windows software without stating a source licence. Borrowed: the graphical-genotype idiom (one coloured bar per chromosome per line). Not borrowed: anything else; no source is available.

## Format specifications

VCF 4.2: https://samtools.github.io/hts-specs/VCFv4.2.pdf (fetched). HapMap as read by TASSEL: https://bitbucket.org/tasseladmin/tassel-5-source/wiki/UserManual/Load/Load (fetched; 11 fixed columns, two-character or single-letter genotypes, N for missing). Flapjack native map and genotype files: https://flapjack.readthedocs.io/en/latest/projects_&_data_formats.html (fetched; tab-delimited, `# fjFile = MAP` / `# fjFile = GENOTYPE`, `G/T` heterozygotes, `-` missing); not implemented as an input, but the same allele vocabulary is accepted by the wide CSV reader.

## solgenomics/sgn (Breedbase)

URL: https://github.com/solgenomics/sgn (fetched). Licence: MIT. Language: Perl; lib/, mason/, db/, js/, t/ and selenium/ directories. Powers Breedbase instances. Not borrowed: anything; it is a server-side database system outside this project's scope, recorded here because it was evaluated.

## hashimotoshumpei/GenoSee

URL: https://github.com/hashimotoshumpei/GenoSee (fetched). Licence: MIT. Language: Python 3.6+ (matplotlib, numpy, pandas). Publication-quality graphical genotype figures from simple A/B/H/N genotypes or phased/unphased VCF-style calls; multiallelic sites unsupported; no CI or tests visible. Borrowed: the A/B/H/N input vocabulary and the normal/comparison/zoomed drawing modes as a checklist for the genotype-view screen. Not borrowed: code; static-figure approach.

## StefanReuscher/ABHgenotypeR

URL: https://github.com/StefanReuscher/ABHgenotypeR/ (fetched). Language: R; CRAN package; R/, man/, vignettes/; no CI visible; licence not shown on the fetched page. ABH genotype coding for parent-based populations with imputation and error-correction functions and ggplot2 graphical genotypes. Borrowed: the coded-CSV vocabulary (A = recurrent, B = donor, H = het) and the idea that error correction is a separate, explicit step. Not borrowed: code; correction is out of scope for the scaffold.

## posit-dev/py-shiny and ThinkR-open/golem, Appsilon/rhino

URLs: https://github.com/posit-dev/py-shiny (fetched; MIT; Python), https://github.com/ThinkR-open/golem (fetched; MIT; R), https://github.com/Appsilon/rhino (fetched; LGPL-3; R). Evaluated for the stack decision in docs/adr/0001 as the Shiny alternatives; not used.

## Searches that found no reusable MABC tool

Searches for open marker-assisted backcrossing or background-selection packages returned PLABSIM (simulation software, not available as a maintained repository) and journal articles describing analyses done in Flapjack or spreadsheets; no maintained open-source repository with an implemented background-selection workflow other than Flapjack was found.

## Layout and conventions modelled on

Repository layout follows flapjack-bytes (single npm package, src/ and test/, ESLint, sample data in the repository) and JBrowse 2 (strict TypeScript, pure data model separated from React views), with scikit-allel's package/docs/tests separation. CI on GitHub Actions follows cropgeeks/flapjack and SNPRelate. MADR, Keep a Changelog, Conventional Commits and SemVer are used as fetched from https://adr.github.io/madr/, https://keepachangelog.com/en/1.1.0/, https://www.conventionalcommits.org/en/v1.0.0/ and https://semver.org/spec/v2.0.0.html.
