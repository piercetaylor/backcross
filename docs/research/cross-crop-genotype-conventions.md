# Cross-crop genotype tokens and chromosome nomenclature (research for contract 1.2.0)

Read-only research, 2026-09-14. Local context: `isoline-browser/docs/contract-1.1-phases.md` line 47 (cross-crop decisions) and `src/core/chromosomes.ts` (soybean-only Gm01–Gm20, alias regex `(gm|chr|chromosome|lg)?[_ -]?0*N`).
Tags: [web] = page actually fetched; [search] = search-engine snippet only, not verified against the page; [unverified] = no source reached.

## Verdict in one paragraph

Every token difference found traces to a **platform or file format** (TASSEL HapMap, DArT, Illumina GenomeStudio, Axiom, KASP SNPviewer, Flapjack) or to **ploidy** (dosage calls), never to a crop community. Two collisions make this concrete: `X` is _missing_ in TASSEL HapMap [1] but `X:X` is a _homozygote_ in KASP SNPviewer [4]; `0/1/2` means `2` = heterozygote in DArT 1-row reports [3] but `1` = heterozygote in VCF/dosage/dartR-genlight [3]. Both are platform facts, identical for soybean and maize. SoyBase's H/U report is a database export format that happens to be soybean-only, not a soybean convention (H/U itself was not verified this round, see [7]). **So the crop selector is a chromosome scheme plus a ploidy flag; token profiles are a separate axis keyed by platform/format**, with at most a per-crop `defaultProfiles[]` hint.

## Crop list (14) and justification

The four mandated (soybean, maize, rice, sorghum) plus the staples with active US public-university breeding and a public reference: wheat, barley, oat, common bean, peanut, cotton, cowpea, pea, sunflower, and potato (kept in the table but flagged out of scope for dosage). Chickpea, lentil and canola are noted at the end for a later release; they are bred mainly in Canada/Australia/ICRISAT and in the US by few programs.

## Crop table

| Crop        | Ploidy / routine calling                                                                                                                                                           | Reference used by public programs                                                   | Verified chromosome spellings (source)                                                                                              | Unplaced / organelle names seen                                                                             | Tokens distinct from format default                                                |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Soybean     | diploid (2n=40)                                                                                                                                                                    | Wm82.a4.v1 (NCBI Glycine_max_v4.0); Wm82.a6.v1 newest, T2T, no scaffolds [search 8] | `Gm01`..`Gm20` (NCBI seq-name) [9]; `1`..`20` (Ensembl Glycine_max_v2.1) [10]                                                       | `scaffold_22`…, `MT`, `Pltd` [9]                                                                            | none; SoySNP50K HapMap uses IUPAC single letters (maintainer note, prior research) |
| Maize       | diploid (2n=20)                                                                                                                                                                    | Zm-B73-REFERENCE-NAM-5.0                                                            | `chr1`..`chr10` (NCBI) [11]; `1`..`10` (Ensembl) [12]                                                                               | `scaffold_21`… (NCBI) vs `scaf_21`… (Ensembl); `MT`, `Pltd` [11][12]                                        | none; Panzea/MaizeGDB distribute TASSEL HapMap and VCF [search 13]                 |
| Rice        | diploid (2n=24)                                                                                                                                                                    | IRGSP-1.0 = MSU7 (same pseudomolecules)                                             | `1`..`12` (NCBI, Ensembl) [14][15]; `Chr1`..`Chr12`, `ChrUn`, `ChrSy` (MSU7) [16]; `chr01` (RAP-DB) [unverified, site cert expired] | `Syng_TIGR_002`…, `MT`/`Pltd` (NCBI), `Mt`/`Pt` (Ensembl), `mitochondrion`/`chloroplast` (MSU) [14][15][16] | none; SNP-Seek offline (funding notice) [17]; formats unverified                   |
| Sorghum     | diploid (2n=20)                                                                                                                                                                    | BTx623 v3.1.1 (= NCBIv3); v5.1 on Phytozome/SorghumBase [search 18]                 | `Chr01`..`Chr10` (NCBI v3) [19]                                                                                                     | `super_16`… [19]; v5.1 names unverified                                                                     | none; GBS/TASSEL and DArTseq common [search]                                       |
| Wheat       | allohexaploid (2n=6x=42, AABBDD); called diploid on subgenome-specific markers; ~30 % of 90K probes show het clusters on homozygotes (homoeologue cross-hybridisation) [search 20] | IWGSC CS RefSeq v2.1                                                                | `Chr1A`..`Chr7D` (NCBI seq-name) [21]; `1A`..`7D` (assigned) [21]; `chr1A`, `chrUn` (IWGSC/URGI native) [unverified, Anubis block]  | `scaffold1A_scf_5`… [21]                                                                                    | none; 90K/Infinium + GenomeStudio, GBS, T3 [search 22]                             |
| Barley      | diploid (2n=14)                                                                                                                                                                    | MorexV3                                                                             | `1H`..`7H` (Ensembl karyotype) [23]; `chr1H`, `chrUn` (IPK native) [search 24]                                                      | `CAJHDD010000001.1`… (Ensembl) [23]                                                                         | none; 50K iSelect (GenomeStudio) [search 25]                                       |
| Oat         | allohexaploid (2n=6x=42, AACCDD); called diploid                                                                                                                                   | PepsiCo OT3098 v2                                                                   | `1A`,`1C`,`1D`..`7D` (Ensembl Oat_OT3098_v2) [26]; `chr1A` (PepsiCo native) [search 27, page 403]                                   | `Un0`, `Un1`, `Un10` (Ensembl) [26]                                                                         | none; GBS, T3                                                                      |
| Common bean | diploid (2n=22)                                                                                                                                                                    | G19833 v2.1 (Phytozome Pvulgaris_442_v2.1)                                          | `1`..`11` (Ensembl PhaVulg1_0 = v1) [28]; `Chr01`/`Pv01` for v2.1 [unverified; KnowPulse page silent] [29]                          | `scaffold_46`… (v1) [28]                                                                                    | none; BARCBean6K, GBS                                                              |
| Peanut      | segmental allotetraploid (2n=4x=40, AABB); Axiom Arachis2 48K first scored 0–4 then diploidised [search 30] – accept diploid tokens only                                           | Tifrunner gnm2 (arahy.Tifrunner.gnm2.J5K5)                                          | `Arahy.01`..`Arahy.20` (01–10 = A, 11–20 = B) [search 31]; Ensembl exposes INSDC accessions `CM064396.1`… only [32]                 | `PIVG02000021.1`… [32]                                                                                      | none                                                                               |
| Cotton      | allotetraploid (2n=4x=52, AADD); called diploid                                                                                                                                    | TM-1 UTX v2.1 (NCBI Gossypium_hirsutum_v2.1); UTX v3.1 exists [search 33]           | `A01`..`A13`, `D01`..`D13` (NCBI) [34]                                                                                              | `scaffold_27`… [34]                                                                                         | none; CottonSNP63K (GenomeStudio)                                                  |
| Cowpea      | diploid (2n=22)                                                                                                                                                                    | IT97K-499-35 v1.2 (NCBI ASM411807v2)                                                | `Vu01(old4)`..`Vu11(old9)` — NCBI seq-name embeds the renumbering [35]; `Vu01` plain [unverified for Phytozome]                     | `contig_3`… [35]                                                                                            | none; Cowpea iSelect 60K                                                           |
| Pea         | diploid (2n=14)                                                                                                                                                                    | Caméor v1a                                                                          | `1LG6`,`2LG1`,`3LG5`,`4LG4`,`5LG3`,`6LG2`,`7LG7` (Ensembl) [36]; `chr1LG6` form [search 37]                                         | `CAADHX020000001.1`… [36]                                                                                   | none                                                                               |
| Sunflower   | diploid (2n=34)                                                                                                                                                                    | HA412-HO v2.0 and HanXRQr2.0-SUNRISE, both active                                   | `Ha412HOChr01` (sunflowergenome.org) [38]; `1`..`17` (Ensembl HanXRQr2.0) [39]; `HanXRQChr01` [search 40]                           | `MNCJ02000001.1`… [39]                                                                                      | none                                                                               |
| Potato      | autotetraploid (2n=4x=48); SolCAP/fitPoly dosage 0–4 [search 41] — **out of scope** for a diploid contract                                                                         | DM 1-3 516 R44 v6.1 (SpudDB)                                                        | `chr01`..`chr12` (SpudDB browser) [42]; `1`..`12` plus `00` bin (Ensembl SolTub_3.0) [43]                                           | `chr00`/`00` = unanchored bin; `chr01_1` seen in SpudDB is another assembly, not DM v6.1 [42]               | dosage tokens `3`,`4` must be refused                                              |

Not first release: chickpea CDC Frontier `Ca1`..`Ca8`, `scaffold1`… (NCBI) [44]; lentil CDC Redberry v2.0, 7 pseudomolecules, names `Lcu.2RBY.Chr1`? [unverified] [45]; canola Darmor-bzh v10 `A01`..`C09` [search 46], Ensembl still serves the old AST_PRJEB5043_v1 supercontig-only assembly [47].

## Platform token table (what each export writes; crop-independent)

| Platform / format                  | Hom                                                        | Het                                       | Missing                      | Special                                                                  | Source                                                     |
| ---------------------------------- | ---------------------------------------------------------- | ----------------------------------------- | ---------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------- |
| TASSEL HapMap                      | `A C G T` (single = homozygous)                            | IUPAC `R Y S W K M`                       | `N`, `X` (both 0xFF)         | `-` deletion, `+` insertion, `0` het indel `-/+`, `Z` rare allele (0xEE) | [1] web (source code)                                      |
| snptools / generic HapMap doc      | same                                                       | same                                      | `N`; `NN` in two-letter form | `+ - 0` as above                                                         | [2] web                                                    |
| DArTseq SNP report                 | 1-row: `0` ref hom, `1` SNP hom; 2-row: 0/1 per allele row | 1-row `2`; dartR genlight re-codes to `1` | `-` (report), `NA` (dartR)   | SilicoDArT 0/1 presence                                                  | [3] search only                                            |
| Illumina GenomeStudio Final Report | `AA`/`BB` or two nucleotide columns (Top/Forward/Plus)     | `AB`                                      | `--`                         | strand variants                                                          | [5] search only                                            |
| Axiom Analysis Suite               | `AA`=0, `BB`=2                                             | `AB`=1                                    | `NoCall`=-1                  | `OTV`=-2                                                                 | [6] search only (first fetch echoed the prompt; discarded) |
| KASP SNPviewer (LGC)               | `X:X`, `Y:Y`                                               | `X:Y`                                     | `?`, `Uncallable`, `Missing` | `NTC` control wells                                                      | [4] web                                                    |
| Intertek/HTPG KASP CSV             | nucleotide `A:A` style                                     | `A:G`                                     | `?` / `Uncallable`           | `Dupe`, `Bad`                                                            | [unverified]                                               |
| Flapjack                           | `A`                                                        | `A/B` (separator `/`, configurable)       | `-`                          | `H` is a render option, not a token                                      | [48] search only                                           |
| VCF                                | `0/0`, `1/1`                                               | `0/1`                                     | `./.`, `.                    | .`                                                                       | phased `                                                   | `   | contract 1.1.0 |
| SoyBase allele report              | nucleotide                                                 | `H`                                       | `U`                          | —                                                                        | maintainer's prior note; not reachable this round (403)    |
| T3 (wheat/barley/oat)              | download-vcf link seen                                     | —                                         | —                            | HapMap/numeric exports unverified                                        | [49] web (nav only)                                        |

## Design consequences for the crop scheme (from the assembly pulls)

1. One crop, several spellings for the same assembly: rice `1` / `Chr1` / `chr01`; wheat `Chr1A` / `1A` / `chr1A`; maize `scaffold_21` / `scaf_21`; organelles `MT`/`Pltd` vs `Mt`/`Pt` vs `mitochondrion`/`chloroplast`. Aliases must be listed per assembly source, not one regex per crop.
2. Zero-padding is not crop-consistent (`Gm01 Chr01 Vu01 A01 Arahy.01` padded; `chr1 Chr1 Ca1 1H 1A` not). Subgenome letter is a suffix (wheat, barley, oat), a prefix (cotton, canola) or a number range (peanut 01–10 = A). Oat letters are A/C/D. Peanut names contain a dot.
3. Renumbering hazards: cowpea `Vu01(old4)`; pea `1LG6` (chromosome ≠ LG number). An alias regex cannot express these; the scheme needs an explicit `renumberingMap` or a refusal note.
4. Unanchored bins masquerade as chromosomes: potato `00`/`chr00`, rice `ChrUn`/`ChrSy`, wheat `chrUn`, oat `Un0…`. `isNuclearChromosome` must exclude them by name, not by "not matching a number".
5. Sunflower bakes the assembly into the prefix (`Ha412HOChr01` vs `HanXRQChr01`); a crop with two live references needs `assemblies[]`, not one canonical form.
6. Allopolyploids (wheat, oat, cotton, canola, peanut) are diploid-called on subgenome-specific markers; the contract cannot detect homoeologue cross-hybridisation. Potato dosage is refused outright.

## Proposed crop-scheme table (fields only)

`id, displayName, species, ploidy, callingMode ('diploid'|'dosage'), dosageOutOfScope, chromosomeCount, defaultAssembly, assemblies[]{name, source, chromosomes[], unplacedPattern, organelles[], unanchoredBins[]}, canonicalTemplate, padding, subgenome{position:'suffix'|'prefix'|'range'|'none', letters[]}, aliasPatterns[]{regex, source}, renumberingMap?, defaultProfiles[], notes, sources[]`

## Sources

[1] [web] https://bitbucket.org/tasseladmin/tassel-5-source/raw/master/src/net/maizegenetics/dna/snp/NucleotideAlignmentConstants.java
[2] [web] https://github.com/amkusmec/snptools/blob/master/FORMATS.md
[3] [search] DArT data-types page fetched but silent on codes (https://www.diversityarrays.com/services/dartseq/dartseq-data-types/); 0/1/2 and `-` from dartR tutorial and papers via search only
[4] [web] https://www.biosearchtech.com/products/pcr-reagents-kits-and-instruments/pcr-instruments-and-software/genotyping-and-lims-software/snpviewer
[5] [search] biostars/BLUPF90 readme snippets; Illumina page not fetched
[6] [search] Thermo Axiom Data Analysis user guide snippet (OTV -2, NoCall -1, AA 0, AB 1, BB 2)
[7] SoyBase 403 (https://www.soybase.org/tools/snp50k/, https://legacy.soybase.org/dlpages/)
[8] [search] SoyBase genome_info and Espina 2024 (Wm82.a6)
[9] [web] https://ftp.ncbi.nlm.nih.gov/genomes/all/GCF/000/004/515/GCF_000004515.6_Glycine_max_v4.0/GCF_000004515.6_Glycine_max_v4.0_assembly_report.txt
[10] [web] https://rest.ensembl.org/info/assembly/glycine_max
[11] [web] https://ftp.ncbi.nlm.nih.gov/genomes/all/GCF/902/167/145/GCF_902167145.1_Zm-B73-REFERENCE-NAM-5.0/..._assembly_report.txt
[12] [web] https://rest.ensembl.org/info/assembly/zea_mays
[13] [search] https://www.panzea.org/genotype-search (fetched; formats not stated)
[14] [web] https://ftp.ncbi.nlm.nih.gov/genomes/all/GCF/001/433/935/GCF_001433935.1_IRGSP-1.0/..._assembly_report.txt
[15] [web] https://rest.ensembl.org/info/assembly/oryza_sativa
[16] [web] https://rice.uga.edu/annotation_pseudo_current.shtml
[17] [web] https://snp-seek.irri.org/ (downtime notice only)
[18] [search] SorghumBase release 6 / Phytozome Sbicolor_v5_1 (Phytozome 403)
[19] [web] https://ftp.ncbi.nlm.nih.gov/genomes/all/GCF/000/003/195/GCF_000003195.3_Sorghum_bicolor_NCBIv3/..._assembly_report.txt
[20] [search] Wang et al. 2014 90K array, PMC4265271
[21] [web] https://ftp.ncbi.nlm.nih.gov/genomes/all/GCF/018/294/505/GCF_018294505.1_IWGSC_CS_RefSeq_v2.1/..._assembly_report.txt
[22] [search] T3 / Illumina consortia pages
[23] [web] https://rest.ensembl.org/info/assembly/hordeum_vulgare
[24] [search] MorexV3 gap paper PMC9241371 (`chrUn`)
[25] [search] Bayer et al. 2017 barley 50k, PMC5651081
[26] [web] https://rest.ensembl.org/info/assembly/avena_sativa_ot3098
[27] [search] GrainGenes OT3098 v2 release pages (403 on fetch)
[28] [web] https://rest.ensembl.org/info/assembly/phaseolus_vulgaris
[29] [web] https://knowpulse.usask.ca/bio_data/2691095 (names not stated)
[30] [search] Axiom Arachis2 studies (PMC8371136; Frontiers 2022 Virginia-type)
[31] [search] Bertioli et al. 2019 Nat Genet; PeanutBase
[32] [web] https://rest.ensembl.org/info/assembly/arachis_hypogaea
[33] [search] CottonGen UTX_v3.1 page listing
[34] [web] https://ftp.ncbi.nlm.nih.gov/genomes/all/GCF/007/990/345/GCF_007990345.1_Gossypium_hirsutum_v2.1/..._assembly_report.txt
[35] [web] https://ftp.ncbi.nlm.nih.gov/genomes/all/GCF/004/118/075/GCF_004118075.2_ASM411807v2/..._assembly_report.txt
[36] [web] https://rest.ensembl.org/info/assembly/pisum_sativum
[37] [search] PulseDB Cameor v1a map pages
[38] [web] https://sunflowergenome.org/assembly-data/
[39] [web] https://rest.ensembl.org/info/assembly/helianthus_annuus
[40] [search] sunflowergenome.org JBrowse URL and gene ids `HanXRQChr02g…`
[41] [search] mappoly tetra.solcap; Frontiers 2024 fpls.1384401
[42] [web] https://spuddb.uga.edu/
[43] [web] https://rest.ensembl.org/info/assembly/solanum_tuberosum
[44] [web] https://ftp.ncbi.nlm.nih.gov/genomes/all/GCF/000/331/145/GCF_000331145.1_ASM33114v1/..._assembly_report.txt
[45] [web] https://knowpulse.usask.ca/genome-assembly/Lcu.2RBY (names not stated)
[46] [search] Rousseau-Gueutin 2020 GigaScience figures
[47] [web] https://rest.ensembl.org/info/assembly/brassica_napus
[48] [search] Flapjack import_data docs
[49] [web] https://wheat.triticeaetoolbox.org/ (navigation only)
