# Handoff: contract 1.7.0, chromosome schemes for cowpea, pea and peanut

Written 2026-09-23, after contract 1.6.0 was committed and pushed in both repositories. This
document is the whole brief: a session that reads it needs nothing from the conversation that
produced it.

## Where things stand

Contract 1.6.0 (half-missing pairs, docs/adr/0021, mirrored as progeny-selector docs/adr/0026) is
on `origin/main` in both repositories. `node scripts/check-contract-mirror.mjs ../progeny-selector`
and `python3 scripts/check_contract.py ../backcross` both report 259 files identical, at
`contract 1.6.0: 72 cases, 258 files`.

Contract 1.5.0 shipped chromosome schemes for nine crops (docs/adr/0020). Four were deferred as
ambiguous: cowpea, pea, sunflower and peanut (docs/m4-phases.md D6.3). Research on 2026-09-23
resolved three of the four. That research is recorded below in full, because it is the input to
this work and nothing else records it.

## The decision the maintainer still owes

**Does the pea scheme accept a bare `1`–`7`?** Everything else below is settled.

Pea's canonical names carry both numbers: NCBI's Cameor v1a assembly names chromosomes
`chr1LG6` … `chr7LG7`, where the leading number is the karyotype number and the `LG` suffix is the
genetic-map linkage group. The ZW6 assembly uses the karyotype numbers alone, as `chr1` … `chr7`.
So `chr4` and `chr4LG4` are the same chromosome and both are safe.

A bare `4` is not safe. The Tayeh 2015 consensus map numbers pea's groups by linkage group
(normally Roman I–VII), so a file whose chromosome column holds bare `1`–`7` may be using either
numbering, and the two disagree. Accepting bare numbers therefore risks reading such a file
silently wrong, which this project's criterion forbids; refusing them costs a user with a
karyotype-numbered file one edit, and the refusal is visible.

Recommendation: require a prefix for pea — accept `chr4`, `chr4LG4`, `4LG4`; refuse bare `4`. The
pattern below implements the wider version the researcher proposed, so **narrowing it is a
deliberate edit, not an omission**: replace the optional `(?:chr|chromosome)?` with a required
`(?:chr|chromosome)` for the forms that carry no `LG` suffix. Whoever takes this work must either
apply that narrowing or record the maintainer's decision to keep bare numbers.

No other crop has this problem: every other scheme's bare numbers have one meaning.

## What ships

### Cowpea — ready

NCBI's assembly report for IT97K-499-35 (ASM411807v2) carries the 2019 renumbering in its sequence
names, so the old-to-new mapping D6.3 called a guess is now documented. The `LG` prefix stays
refused (D6.2). The parenthetical NCBI form is accepted only in its eleven exact pairings, so
`Vu01(old7)` — a wrong pairing — falls through rather than being read as `Vu01`.

```json
{
  "id": "cowpea",
  "name": "Cowpea",
  "species": "Vigna unguiculata",
  "ploidy": 2,
  "assembly": "IT97K-499-35 v1.1 (NCBI ASM411807v2; Vu01-Vu11 is the 2019 numbering, pre-2019 linkage-group numbers differ: Vu01=old LG4, Vu02=old7, Vu03=old3, Vu04=old11, Vu05=old1, Vu06=old6, Vu07=old2, Vu08=old5, Vu09=old8, Vu10=old10, Vu11=old9)",
  "chromosomes": [
    "Vu01",
    "Vu02",
    "Vu03",
    "Vu04",
    "Vu05",
    "Vu06",
    "Vu07",
    "Vu08",
    "Vu09",
    "Vu10",
    "Vu11"
  ],
  "keys": ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"],
  "pattern": "^(?:vu|chr|chromosome)?[_\\s-]?(?:0*([1-9]|1[01])|0*(1)\\(old4\\)|0*(2)\\(old7\\)|0*(3)\\(old3\\)|0*(4)\\(old11\\)|0*(5)\\(old1\\)|0*(6)\\(old6\\)|0*(7)\\(old2\\)|0*(8)\\(old5\\)|0*(9)\\(old8\\)|0*(10)\\(old10\\)|0*(11)\\(old9\\))$",
  "sources": [
    "https://ftp.ncbi.nlm.nih.gov/genomes/all/GCF/004/118/075/GCF_004118075.2_ASM411807v2/GCF_004118075.2_ASM411807v2_assembly_report.txt",
    "https://data.legumeinfo.org/Vigna/unguiculata/genomes/IT97K-499-35.gnm1.QnBW/README.IT97K-499-35.gnm1.QnBW.yml",
    "https://www.biorxiv.org/content/10.1101/518969v1.full",
    "https://pmc.ncbi.nlm.nih.gov/articles/PMC10791481/",
    "https://pmc.ncbi.nlm.nih.gov/articles/PMC6469422/"
  ]
}
```

### Pea — ready once the decision above is taken

The pattern as written accepts bare `1`–`7`. See the decision section.

```json
{
  "id": "pea",
  "name": "Pea",
  "species": "Pisum sativum",
  "ploidy": 2,
  "assembly": "Cameor Pisum_sativum_v1a (chromosome number is the karyotype number, LG suffix is the genetic-map linkage group: chr1LG6, chr2LG1, chr3LG5, chr4LG4, chr5LG3, chr6LG2, chr7LG7; ZW6 uses the same chromosome numbers as chr1-chr7)",
  "chromosomes": ["chr1LG6", "chr2LG1", "chr3LG5", "chr4LG4", "chr5LG3", "chr6LG2", "chr7LG7"],
  "keys": ["1", "2", "3", "4", "5", "6", "7"],
  "pattern": "^(?:chr|chromosome)?[_\\s-]?(?:0*(1)(?:LG6)?|0*(2)(?:LG1)?|0*(3)(?:LG5)?|0*(4)(?:LG4)?|0*(5)(?:LG3)?|0*(6)(?:LG2)?|0*(7)(?:LG7)?)$",
  "sources": [
    "https://ftp.ncbi.nlm.nih.gov/genomes/all/GCA/900/700/895/GCA_900700895.2_Pisum_sativum_v1a/GCA_900700895.2_Pisum_sativum_v1a_assembly_report.txt",
    "https://rest.ensembl.org/info/assembly/pisum_sativum?content-type=application/json",
    "https://ftp.ncbi.nlm.nih.gov/genomes/all/GCA/024/323/335/GCA_024323335.2_CAAS_Psat_ZW6_1.0/GCA_024323335.2_CAAS_Psat_ZW6_1.0_assembly_report.txt",
    "https://pmc.ncbi.nlm.nih.gov/articles/PMC13389026/"
  ]
}
```

A wrong pairing such as `chr1LG1` falls through, as with cowpea.

### Peanut — ready, with a stated gap

Both Tifrunner releases number 01–20, A subgenome 01–10 and B subgenome 11–20, confirmed by NCBI
(gnm1 `Arahy.01`…, gnm2 `arahy.Tifrunner.gnm2.chr01`…), LegumeInfo and the Zhuang 2019 genome
paper.

```json
{
  "id": "peanut",
  "name": "Peanut",
  "species": "Arachis hypogaea",
  "ploidy": 4,
  "assembly": "Tifrunner gnm1 KYV3 / gnm2 J5K5 (Arahy.01-Arahy.10 = A subgenome, Arahy.11-Arahy.20 = B subgenome; gnm2 NCBI seq-name arahy.Tifrunner.gnm2.chrNN; A01-A10/B01-B10 and Aradu./Araip. tokens are not mapped)",
  "chromosomes": [
    "Arahy.01",
    "Arahy.02",
    "Arahy.03",
    "Arahy.04",
    "Arahy.05",
    "Arahy.06",
    "Arahy.07",
    "Arahy.08",
    "Arahy.09",
    "Arahy.10",
    "Arahy.11",
    "Arahy.12",
    "Arahy.13",
    "Arahy.14",
    "Arahy.15",
    "Arahy.16",
    "Arahy.17",
    "Arahy.18",
    "Arahy.19",
    "Arahy.20"
  ],
  "keys": [
    "1",
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
    "10",
    "11",
    "12",
    "13",
    "14",
    "15",
    "16",
    "17",
    "18",
    "19",
    "20"
  ],
  "pattern": "^(?:(?:arahy\\.tifrunner\\.gnm[12]\\.)?(?:arahy\\.|chr)|chromosome)?[_\\s-]?0*([1-9]|1[0-9]|20)$",
  "sources": [
    "https://ftp.ncbi.nlm.nih.gov/genomes/all/GCF/003/086/295/GCF_003086295.2_arahy.Tifrunner.gnm1.KYV3/GCF_003086295.2_arahy.Tifrunner.gnm1.KYV3_assembly_report.txt",
    "https://hgdownload.soe.ucsc.edu/hubs/GCF/003/086/295/GCF_003086295.3/GCF_003086295.3_assembly_report.txt",
    "https://rest.ensembl.org/info/assembly/arachis_hypogaea?content-type=application/json",
    "https://data.legumeinfo.org/Arachis/hypogaea/genomes/Tifrunner.gnm1.KYV3/README.Tifrunner.gnm1.KYV3.yml",
    "https://data.legumeinfo.org/Arachis/hypogaea/genomes/Tifrunner.gnm2.J5K5/README.Tifrunner.gnm2.J5K5.yml",
    "https://www.osti.gov/pages/servlets/purl/2479207",
    "http://oar.icrisat.org/11189/1/The%20genome%20of%20cultivated%20peanut%20provides%20insight%20into%20legume%20karyotypes%2C%20polyploid%20evolution%20and%20crop%20domestication.pdf",
    "https://pmc.ncbi.nlm.nih.gov/articles/PMC7822046/"
  ]
}
```

**The gap, which must be stated in the ADR rather than discovered later.** The scheme model builds
a canonical name from a key that is a substring of the input, so it cannot map `B01` to `11`. The
`A01`–`A10` / `B01`–`B10` spelling, and the `Aradu.A09` / `Araip.B08` spellings that Axiom_Arachis2
studies use, therefore pass through unchanged under the 1.2.0 fallback: ordered after the canonical
names, kept as written. That is visible, not silently wrong — a user sees `B01` in the gutter and
the export rather than a mislabelled `Arahy.11`. Closing it needs an alias table in the scheme
schema, which is a larger change and its own decision.

### Sunflower — defer again, with a specific unblock condition

Do not ship a sunflower scheme on the evidence available. The discriminating fact is whether
`Ha412HOChrNN` equals `HanXRQChrNN` for all 17 chromosomes, and no fetched source states it.

- HanXRQr2.0-SUNRISE is registered: NCBI seq-names `HanXRQChr01`…`17`, Ensembl exposes bare `1`…`17`.
- HA412-HOv2 is the active breeding reference, names `Ha412HOChr01`…, and has no INSDC record.
- Newer assemblies are numbered "according to the reference HanXRQr2.0-SUNRISE" (PMC11707268), and
  four loci keep the same chromosome number in both references — chr2 and chr8 (Pl18/Pl20), chr13
  (Rf5/R11), chr15 (HaMYB111) — which is four of seventeen and not a statement about the rest.

An XRQ-only scheme does not dodge the risk, because bare `1`…`17` would be accepted under either
assembly and HA412 data would be relabelled as XRQ. **Unblocks on** one explicit statement that the
two numberings agree, or a whole-genome synteny table (the Todesco 2020 supplement is image-only
and the Nature main text is paywalled). If it unblocks, ship with canonical bare `1`…`17` as
Ensembl exposes them, so exports do not assert an assembly the data may not be on.

## What to change

Nine crops exist today; this adds three. Both repositories carry a copy of `contract/crops/`.

In backcross:

- `contract/crops/cowpea.json`, `pea.json`, `peanut.json` — new, hand-written, matching the schema
  of the nine existing files exactly (read `contract/crops/rice.json` first).
- `contract/VERSION` -> `1.7.0`, the `Contract version:` line of `contract/data-contract.md`, and
  the version in `docs/data-formats.md`. `contract/README.md` gains a 1.7.0 history paragraph.
- `contract/data-contract.md` — the crop list, and any per-crop notes the existing nine carry.
- `src/io/crops.ts` — three static imports and three entries in the `BUILTIN_CROPS` list at
  line 109. The registry is a literal list, so a new JSON file alone does nothing.
- `scripts/make-contract.mjs` — three `crop-<id>-spellings` cases following the pattern at the
  `crop-soybean-spellings` block. Each case chooses its scheme with `{ "crop": "<id>" }` in
  `options.json`. **Never edit generated files under `contract/cases/`**; run `npm run contract`.
- `tests/crops.test.ts` — hand-built assertions per crop. These carry the weight: a generated case
  compares the generator against the implementation and cannot catch a shared misreading of a
  spelling. Assert both what maps and what must fall through — for cowpea `Vu01(old7)`, `LG4`,
  `Vu12`; for pea `chr1LG1`, `LG6`, `8`, plus bare `4` if the decision refuses it; for peanut
  `A01`, `B01`, `Aradu.A09`, `Arahy.21`.
- `src/ui/screens/UploadScreen.tsx` — the Crop select.
- `docs/adr/0022-contract-1.7-crop-schemes.md` — new; `0021` is the most recent. Record the three
  schemes, the pea decision and its reason, peanut's alias gap, and sunflower's unblock condition.

In progeny-selector:

- `contract/` re-copied byte for byte from backcross (binary copy, never a text-mode tool).
- `src/progeny_selector/io/crops.py` — the same three schemes registered.
- `tests/test_crops.py` — the twins of the backcross assertions.
- `docs/data-formats.md` — the version and the crop list.
- `docs/adr/0027-...` — the mirror record; `0026` is the most recent. Follow `0020`, which is the
  1.5.0 mirror record, as the pattern.

## Gates and checks

Both patterns must be tested in **both** engines before anything else: Node `RegExp` and Python
`re`. The multi-group alternations in the cowpea pattern rely on the normalisers filtering
undefined groups (`src/core/chromosomes.ts` `keyOf`, `progeny-selector/.../core/chrom.py` `_key_of`);
confirm that still holds rather than assuming it.

backcross: `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:browser`, `npm run build`,
then `npm run fixture` and `npm run contract` with `git diff --exit-code -- tests/fixtures contract`
clean. progeny-selector, from its own root and in its `.venv` (its ruff config sets
`line-length = 140`; an isolated run at the default 88 produces false E501s): `ruff check .`,
`ruff format --check .`, `mypy`, `pytest` — plain, no extra `-q`, because the project's `addopts`
already carries one and a second suppresses the counts.

Mirror, both directions: `node scripts/check-contract-mirror.mjs ../progeny-selector` from
backcross and `python3 scripts/check_contract.py ../backcross` from progeny-selector. Both must
report the same file count.

An adversarial reviewer takes the diff before the commit. Both M4 contract phases and contract
1.6.0 were reviewed and a real defect was found each time; 1.6.0's was prose that made live
behaviour read as an error.

`CHANGELOG.md` gets an `[Unreleased]` entry in both repositories — every contract version since
1.1.0 has one, including the wording-only 1.2.1.

## Coordination

Another session works in `progeny-selector` regularly. Before touching `contract/crops/` there,
message it and wait: both repositories' trees have been shared before, and the agreed protocol is
explicit pathspecs, never `git add -A`, and one contract change in flight at a time. Doers run no
git; the main session commits.

## Out of scope, and why

- **A pair of two missing characters** (`N/N`, `..`, `N-`) is read as missing by both tools and
  contract 1.6.0 explicitly declines to define it. The maintainer decides whether to state it;
  it is not a crop question and does not belong in 1.7.0.
- **The HapMap allele-table divergence**: for the same row, backcross seeds a marker's allele table
  from the `alleles` column while progeny-selector keeps only alleles a resolved call uses. No
  contract case can see it, because `expected.json` carries no alleles. Pre-existing, real, and its
  own piece of work.
- **Peanut's alias table** (see above).
- **The crop palette question** (docs/adr/0017): whether the chrome's leaf green and wheat gold
  should move further from two Okabe-Ito class colours. Unanswered, and unrelated to schemes.
