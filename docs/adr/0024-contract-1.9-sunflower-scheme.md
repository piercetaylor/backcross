# Contract 1.9.0: a sunflower chromosome scheme

Status: accepted. Date: 2026-09-26. Format: MADR 4.0.0 [web] https://adr.github.io/madr/.

## Context and Problem Statement

Contract 1.5.0 (ADR 0020) deferred sunflower under D6.3 with cowpea, pea and peanut, "because a bare number is ambiguous in each and a scheme that guessed would be silently wrong". Contract 1.7.0 (ADR 0022) shipped the other three and deferred sunflower again: the deciding fact is whether `Ha412HOChrNN` equals `HanXRQChrNN` for all 17 chromosomes, and no source fetched then said so. ADR 0022 set the unblock condition: "It unblocks on one explicit statement that the two numberings agree, or a whole-genome synteny table; if it unblocks, the canonical names are bare `1`..`17` as Ensembl exposes them."

The maintainer delegated the research ("ask fable") under the criterion **best for academic and open-source plant-breeding users, reproducible with standard tools, tolerant of real exported spellings, never silently wrong**, and on 2026-09-26 accepted the evidence below as meeting ADR 0022's condition.

## Decision Drivers

- Never silently wrong: a spelling from either live assembly must land on the chromosome it names in the other.
- Tolerant of real exported spellings: the FASTA headers of both assemblies (`HanXRQChr01`, `Ha412HOChr01`) and the `chr`, `chromosome` and bare-number forms that TASSEL, GAPIT and VCF exports carry should be read without an edit.
- The scheme model of ADR 0020 D6.1 is unchanged: one pattern whose capture groups yield a key that is a substring of the input. No alias table is added in this version.
- A new optional crop id is additive, so this is a minor bump (ADR 0013).

## Considered Options

1. **Ship `sunflower` with bare `1`..`17`, reading both assemblies' prefixes.**
2. **Keep sunflower deferred.**

## Decision Outcome

**Chosen: option 1, shipped as contract 1.9.0, a minor bump.** `BUILTIN_CROPS` appends `sunflower` after `peanut`, making thirteen schemes; `soybean` stays the default. The pattern is `^(?:ha412hochr|hanxrqchr|chr|chromosome)?[_\s-]?0*([1-9]|1[0-7])$`, checked to match identically under JavaScript `new RegExp(p, 'i')` and Python `re.compile(p, re.I)`.

**The evidence chain.** Each link was read in its primary source.

- HanXRQr2.0-SUNRISE's assembly report lists `HanXRQChr01`..`HanXRQChr17` as assigned molecules 1..17 (CM007890.2..CM007906.2, NC_035433.2..NC_035449.2) [web] https://ftp.ncbi.nlm.nih.gov/genomes/all/GCF/002/127/325/GCF_002127325.2_HanXRQr2.0-SUNRISE/GCF_002127325.2_HanXRQr2.0-SUNRISE_assembly_report.txt.
- The r1 GenBank record of chromosome 1 carries DEFINITION "Helianthus annuus linkage group 1", replaced by CM007890.2, chromosome 1 [web] https://www.ncbi.nlm.nih.gov/nuccore/CM007890.1.
- Badouin et al. 2017, SI Notes 1.6 and 1.7: the XRQ and HA412-HO v1 pseudomolecules were both anchored to the linkage groups of the same consensus genetic map [web] https://static-content.springer.com/esm/art%3A10.1038%2Fnature22380/MediaObjects/41586_2017_BFnature22380_MOESM1_ESM.pdf.
- Bowers et al. 2012 take their chromosome numbers from the earlier sunflower consensus map [web] https://www.ebi.ac.uk/europepmc/webservices/rest/PMC3385978/fullTextXML.
- The PNAS 2023 linkage-drag SI anchors XRQv2 with the XRQv1 maps, and its Fig. S2, a MUMmer dot plot of HA412-HOv2 against XRQv2, shows one diagonal in the rank-matching cell of every one of the 17 rows [web] https://www.ebi.ac.uk/europepmc/webservices/rest/PMC10083583/supplementaryFiles.
- The HA412-HOv2.0 FASTA headers are `Ha412HOChr01`..`Ha412HOChr17` [web] https://sunflowergenome.org/assembly-data/.

**The weakest link is HA412-HOv2.** It is a separate Hi-C assembly with no method sentence on how its chromosomes were numbered, so its link to XRQ is the whole-genome MUMmer dot plot of Fig. S2 alone. The XRQ strip labels of that figure are clipped in the PDF, so the pairing is read from the rank-matching diagonal rather than from printed labels. The maintainer accepted this on 2026-09-26 as meeting ADR 0022's unblock condition, a whole-genome synteny comparison, although it is a figure and not a table.

**Secondary, locus-level corroboration**, none of it load-bearing: Pl18 on chromosome 2 and Pl20 on chromosome 8 (https://pmc.ncbi.nlm.nih.gov/articles/PMC7765508/); Pl17 and Pl19 on chromosome 4 (https://pmc.ncbi.nlm.nih.gov/articles/PMC6802088/); Rf1 and Rf7 on chromosome 13 (https://pmc.ncbi.nlm.nih.gov/articles/PMC6426773/).

**No `LG` prefix.** ADR 0020 D6.2 is kept: the `LG` prefix stays soybean-only, although the r1 GenBank records label chromosome N "linkage group N". `LG1` is kept as written.

**HA412-HO v1.1 names are kept as written for now.** A v1.1 file's `Ha1`..`Ha17` names fall through, because no header list for v1.1 was fully confirmed.

**Accessions are kept as written.** `NC_035433.2` and `CM007890.2` fall through, the same alias-table gap as peanut's subgenome spellings (ADR 0022): visible, not silent.

### The file

| id          | name / species / ploidy         | assembly                            | chromosomes (canonical) | keys      | accepted                                                                                   | kept as written                                                                                                                                                     |
| ----------- | ------------------------------- | ----------------------------------- | ----------------------- | --------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sunflower` | Sunflower, Helianthus annuus, 2 | HanXRQr2.0-SUNRISE and HA412-HOv2.0 | `1`..`17`               | `1`..`17` | `Ha412HOChr01`, `HanXRQChr17`, `HANXRQCHR09`, `chr1`, `Chr_17`, `chromosome-4`, `17`, `01` | `HanXRQChr00c001`, `Ha412HOChr00`, `chr0`, `chr18`, `18`, `MT`, `Pltd`, `HanXRQMT`, `HanXRQCP`, `Ha412HOv2Chr01`, `LG1`, `NC_035433.2`, `CM007890.2`, `Ha1`, `Ha10` |

Every spelling in the last two columns is asserted in `tests/crops.test.ts`, and the case `crop-sunflower-spellings` pins `Ha412HOChr01`, `HanXRQChr02`, `chr3` and a bare `17` as read and `HanXRQChr00c001` and `NC_035433.2` as kept as written, so the reading is checked in both repositories.

### Consequences

- Good: sunflower files from either live assembly read and order their chromosomes on one numbering; no existing scheme, default or output changes.
- Neutral: canonical names are bare numbers, so a sunflower export shows `1`..`17` rather than either assembly's prefix.
- Bad: pre-2002 RFLP maps used other linkage-group labels; none was found in a TASSEL- or GAPIT-era export, and a hand-stripped file on that numbering would be read as the consensus numbering. A v1.1 file's `Ha1` names fall through visibly until they are confirmed.

## Revisit when

- A v1.1 header list confirms `Ha1`..`Ha17`: the `ha` prefix can then be read.
- A real sunflower export uses `LG` for chromosome numbers.
- Evidence shows the HA412-HOv2 numbering differs from XRQ's on any chromosome.

## More Information

Contract 1.9.0: `contract/crops/sunflower.json`, `contract/data-contract.md` ("Chromosome names"), `contract/VERSION`, `contract/README.md`. Mirrored byte for byte into `progeny-selector`, whose record is its ADR 0029. Closes ADR 0022's sunflower deferral, and with it the last crop of ADR 0020 D6.3.
