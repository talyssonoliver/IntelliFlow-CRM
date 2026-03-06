# Sprint 10 Completion Audit Report

**Run ID:** `sprint10-audit-20260301T003222-s9ki7w`
**Generated:** 01/03/2026, 00:32:29
**Duration:** 7.0 seconds
**Strict Mode:** No

## ❌ Overall Verdict: **FAIL**

## Summary

| Metric | Count |
|--------|-------|
| Total Tasks in Sprint | 5 |
| Completed Tasks | 5 |
| Tasks Audited | 5 |
| ✅ Passed | 2 |
| ❌ Failed | 2 |
| ⚠️ Needs Human Review | 1 |

## Evidence Summary

| Category | Found | Issues |
|----------|-------|--------|
| Artifacts | 157 ✓ | 0 missing, 0 empty |
| Validations | 0 passed | 2 failed |
| KPIs | 0 met | 0 missed |
| Placeholders (in task artifacts) | - | 46 found |
| Placeholders (codebase total) | - | 1196 found |

## ⛔ Blocking Issues

These issues must be resolved before sprint can be considered complete:

### 🔴 Critical
- **IFC-099**: Validation(s) failed: pnpm test
  - *Recommendation:* Remove TODO, FIXME, STUB, and empty function placeholders
- **IFC-141**: Validation(s) failed: pnpm test
  - *Recommendation:* Fix failing validations before marking complete

### 🟠 High
- **IFC-099**: Found 1 placeholder(s) in task artifacts
  - *Recommendation:* Remove TODO, FIXME, STUB, and empty function placeholders
- **IFC-099**: 7 DoD criteria unverified
  - *Recommendation:* Remove TODO, FIXME, STUB, and empty function placeholders
- **IFC-141**: 11 DoD criteria unverified
  - *Recommendation:* Fix failing validations before marking complete

## Task Details

### ❌ Failed Tasks

#### ❌ IFC-099

**Description:** ERP/Payment/Email Connectors
**Status:** Completed

**Issues:**
- Found 1 placeholder(s) in task artifacts
- Validation(s) failed: pnpm test
- 7 DoD criteria unverified

**Recommendations:**
- Remove TODO, FIXME, STUB, and empty function placeholders
- Fix failing validations before marking complete

**Placeholders Found:**
- `packages\adapters\src\email\outlook\client.ts:513` - SIMULATED_DATA: `// MS Graph sendMail returns 202 Accepted with no ...`

**Failed Validations:**
- `pnpm test` (exit code: 124)
  - Error: Command timed out after 600000ms

---

#### ❌ IFC-141

**Description:** Evaluate n8n; custom engine; and Temporal; document decision via ADR; build event-driven minimal rules engine and integrate selected workflow engine
**Status:** Completed

**Issues:**
- Validation(s) failed: pnpm test
- 11 DoD criteria unverified

**Recommendations:**
- Fix failing validations before marking complete

**Failed Validations:**
- `pnpm test` (exit code: 124)
  - Error: Command timed out after 600000ms

---

### ⚠️ Needs Human Review

#### ⚠️ IFC-076

**Description:** Component Library (shadcn/ui)
**Status:** Completed

**Issues:**
- Found 45 placeholder(s) in task artifacts
- 5 DoD criteria unverified

**Recommendations:**
- Remove TODO, FIXME, STUB, and empty function placeholders

**Placeholders Found:**
- `packages\ui\__tests__\textarea.test.tsx:113` - PLACEHOLDER: `expect(textarea).toHaveClass('placeholder:text-mut...`
- `packages\ui\__tests__\search-input.test.tsx:23` - EMPTY_FUNCTION: `() => {}...`
- `packages\ui\__tests__\search-input.test.tsx:83` - EMPTY_FUNCTION: `() => {}...`
- `packages\ui\__tests__\search-input.test.tsx:89` - EMPTY_FUNCTION: `() => {}...`
- `packages\ui\__tests__\search-input.test.tsx:94` - EMPTY_FUNCTION: `() => {}...`
- ... and 40 more

---

### ✅ Passed Tasks

<details>
<summary>Click to expand passed tasks</summary>

- **IFC-113**: Implement secrets management and encryption at rest and in t...
  - Artifacts: 5 verified
  - Validations: 0 passed
  - KPIs: 0/2 met
- **IFC-121**: Schedule periodic secret rotation and dependency vulnerabili...
  - Artifacts: 4 verified
  - Validations: 0 passed
  - KPIs: 0/2 met
</details>

## Artifact Hashes

SHA256 hashes for all verified artifacts:

```
3ff1d061d79e414de20b13824811a55033d3bac433236ecc6b41f7180b97c194  .specify/sprints/sprint-10/specifications/IFC-076-spec.md
c443638399b916f0b4a8f4417638fe87ae225e35936539a064c7dcffb20960d5  .specify/sprints/sprint-10/planning/IFC-076-plan.md
d15c20b1d7994211cb0341f991eb6f53705de059f884453fd151917c7c80aaa5  .specify/sprints/sprint-10/attestations/IFC-076/context_pack.md
6cc80b17e539353ca015a0a3ddcea41b6e60a85507cfdc87f987c1e18595fb75  .specify/sprints/sprint-10/attestations/IFC-076/context_ack.json
b31a5a5d01ae7c9cc7dc22785b761ddcba1408937fd60de3499d7355a7839575  artifacts/misc/accessibility-audit.json
4e3612f7c258ccb737b9a638b5790320ad6a599481e5b01ec023cab693fbd506  artifacts/misc/component-usage.csv
8d8a1d6e0bde3ce7a20e0cde67002af7b8b55e3cc4901bce2368a88f77e106eb  packages\ui\src\components\tooltip.tsx
e8b33891d99e4e48baa175400b15ba4595c12eae980e335322603af7d508b777  packages\ui\src\components\tooltip.stories.tsx
7388fbc7e554e4bd29d579b22ee8aadad92b524959f7a3ba01bb9c0a7783e536  packages\ui\src\components\toaster.tsx
dac020902e67ec810afdafc91169546a4d23ccbebf15342eaab7ead2135c7d10  packages\ui\src\components\toast.tsx
1f3af08e352e3111c41005b23a42534dbcd81c84bafac4555a0d8acab200e67d  packages\ui\src\components\textarea.tsx
90fc37176e6060d8995c55c94d50fd4c9ab7eec514c698c3b470e63153db1389  packages\ui\src\components\textarea.stories.tsx
d8996c82946a734586b3d903e5ac4521dfffca5b06f4835825c8d2cffc96a27e  packages\ui\src\components\tabs.tsx
8f2836adbff3081ab11c159a888259c11e81e0ae5458dad6690631e652b0c337  packages\ui\src\components\tabs.stories.tsx
6f919984c97429cf0be63edd9e12fcdc56885092ad872363631cf3acccd7f023  packages\ui\src\components\table.tsx
6180bc622286471f221a265a93ba85a021224b16ebccefb0af588b2be3ac9ff2  packages\ui\src\components\switch.tsx
0ad8bb5b3d6848a29826d803300e65129dace74665c485e8cf93a06f1076c8f7  packages\ui\src\components\switch.stories.tsx
148f992b6249c28407bcb2ea7ad11c1720eaf650d02321e7164a9201dc94053b  packages\ui\src\components\status-select-dialog.tsx
c5fcc6ab27ab810854f5ea474343429deec9ea2e183c9fc3fb53d8247063646c  packages\ui\src\components\status-badge.tsx
519db1469d686dcade17178c52fcb11f65d6747df7e9436fa04d62a0796c66d0  packages\ui\src\components\status-badge.stories.tsx
692deefe0a669e6d029f05ea38a20b0c40ea8701115de297b2216eed3ce9597f  packages\ui\src\components\slider.tsx
bff59aae297573596b8dcff0a81546aa18495c8276573ba3e55577198ae0af7b  packages\ui\src\components\slider.stories.tsx
cbdc57693223ce7f79c2927a9e9ee9ef1c7306d9fa627a18431ae146ca7210c6  packages\ui\src\components\skeleton.tsx
019a9ecc36f883df702a75e82464869bfd35da2fd4d484591730b924a64a7bda  packages\ui\src\components\skeleton.stories.tsx
79a9245aeedc73274d2cd158a55a3a30df67c23a9b61c453decd92b78eb737cb  packages\ui\src\components\sheet.tsx
44b9c76f782a1d506f3eb6748a7808e2ab5999a54adce09678eb980ac10aaa2e  packages\ui\src\components\separator.tsx
f65b10a71d21886f61c0519034aa847fa3ef01d5d82c4af494f6db06273e4f17  packages\ui\src\components\separator.stories.tsx
f647f37a748a57854f3320e1017ffcc14374bbe8f344b9190cf6d6627dc71c81  packages\ui\src\components\select.tsx
c8e20b3c2ec385cbbfbe2dcb475f7d6b279ce1a6face3472e623295ce1e6b600  packages\ui\src\components\select.stories.tsx
f4b445e923dc9c6f38d8739f7aaded0d5e79e185652c8f39a28e3cc0400925b5  packages\ui\src\components\search-input.tsx
a9ed26486e1de460898ac01583c827dcb305a78143ba61cbf7a5fafd618a8483  packages\ui\src\components\search-input.stories.tsx
0faf05ef61a52690e7011d993cfa4eb5b8dfe1c5be2802f0b3c3ae7a0f870ee0  packages\ui\src\components\scroll-area.tsx
9cbe4a274e6562c0fea1df72cd7a222183556fae223775a382cd254e934caabb  packages\ui\src\components\radio-group.tsx
5684415a09c62e41327661c742d7d817e80fce80533c0f90198865d212d4e2eb  packages\ui\src\components\radio-group.stories.tsx
e41dc9a4940e05f83794cccb7ef58e3484c69843377ad215cfcb79cf65a18ec6  packages\ui\src\components\progress.tsx
161dcb895e841d8a49e0c569f69e5bd66bfacacaf71a98f3f0272af1bc20feab  packages\ui\src\components\progress.stories.tsx
54d5f748b55ce65dc839a1a37b49282824a7a439c27f8ac10431409b12db7fdd  packages\ui\src\components\popover.tsx
ba4a27beb7792709da2f41a18a98934353a45093d783fa3d6dfccf1ab8d9e806  packages\ui\src\components\pagination.tsx
a6d4f65eefa857921b29cf531b4a91c4a1431d9f5e95652b64315fbec541f5ea  packages\ui\src\components\pagination.stories.tsx
26c8d980a2baff9e7606be2719732facb11bc3b630675e48d629303419973ff9  packages\ui\src\components\metric-card.tsx
417dd975418a83e1ad3e194c9823aa2faf2264dbf3b3537ab42fdbcecf762985  packages\ui\src\components\metric-card.stories.tsx
13f0f878ea620ff6d90a01730780329d63905e53e046c74140f7262041e46430  packages\ui\src\components\label.tsx
c777c32740b9a40e3ee67c7b9b953dd1e8cf01133b1b7f2a27f7809f2ebfbb9d  packages\ui\src\components\input.tsx
3b3c22bf63d4ad75f0b302ff0d73b27576b4597d87d8b58ac99273a40b6fd936  packages\ui\src\components\input.stories.tsx
6bf4c6b6e2e7dd1fa4d0d88b16f9bd5f0e659dda4f3451ed5c8c2d5349b540b4  packages\ui\src\components\index.ts
1763aae49c6841fb60b9a5c545032a5cd5a48e920bd82e96e323dcf2b6ba5445  packages\ui\src\components\icon-badge.tsx
4e1dd62e0aa8af6552c21f967fc1444fd71bfbfec5acf261ec527d21625cc15e  packages\ui\src\components\icon-badge.stories.tsx
651ffdef46fbdab01103e54557726f32b79a652f03643b19f0d1add6833ccf15  packages\ui\src\components\form.tsx
1f3424fdd7e1bf69a2f359582ceac2c556aeec9a522d966e420e25b506e630b0  packages\ui\src\components\error-state.tsx
45bea083de17ec10571bcf3b600a8e2208e32bcf5bc70866c2d4f624a888610f  packages\ui\src\components\error-state.stories.tsx
1ead9952b34d55aa2c09582f6504cfe28e112dca6bd711b2fc1d7a119230ccf5  packages\ui\src\components\entity-avatar.tsx
1856cd33b32ebe72ccdf2be957789a7360b850a92a4c5546a4132a43ec763bd8  packages\ui\src\components\entity-avatar.stories.tsx
da75cfd8e3d32ab1dc079795237bae4b129d3cd3643d1db927554142920c338d  packages\ui\src\components\empty-state.tsx
e41464625d0b6c10adf51435f9463de06f7643be5ce18323d750ab3ea305072c  packages\ui\src\components\empty-state.stories.tsx
3497ef2e42abd01c248508433b17e01c22ed8364e51fbbaef8344028b7177427  packages\ui\src\components\dropdown-menu.tsx
7c79b6ebbd223bc693efe824c77efaf8eb74b39feb8807350b772e631663a50d  packages\ui\src\components\dialog.tsx
7d69f9f9dbfdd99d4a67c9e151eac6472f2f0ef326290cb29c2c3684d3e62609  packages\ui\src\components\dialog.stories.tsx
9117db168f4f4860d4229d106a3e15567836b18740fde47972dee796d751b496  packages\ui\src\components\data-table.tsx
c18fc10d37346a8fae998ff7e2c77fe89b9a5dd32a55c15264b9ead0db735b42  packages\ui\src\components\confirmation-dialog.tsx
08e1d59799d609af426605a1c05c7bba4944e8a1ea5db6edf91f4fc987a98684  packages\ui\src\components\checkbox.tsx
5d4f0e0ee9bb5be7d4c0d45b5ec343acb7af3147fc129dbf5e435a753f61f359  packages\ui\src\components\checkbox.stories.tsx
e5a3a89a2f561d357508506ce58eae410fefb65462e448ca50db404281349030  packages\ui\src\components\card.tsx
4c85ebb4c3caa1c211c4523c4e744ae04567c2cc9a8d12a05ddd55609e9e09f2  packages\ui\src\components\card.stories.tsx
93a42b7efeb4dc682e402fa592a25ef81bea9ba353a99bac1959e8bab639504e  packages\ui\src\components\button.tsx
20f7b684f3f8e6316387fe2c902ed43dee120a0052aa25adae20d952da727a61  packages\ui\src\components\button.stories.tsx
31c641ae1d91de47d9aafbcf30fa981c75b1ca7b8d2d7286571428e7e5f1c351  packages\ui\src\components\badge.tsx
20148b13c08876c35b51ee561c06e5ab88c485deb26e7d9293bf36ea6587d4cf  packages\ui\src\components\badge.stories.tsx
b0b8febbbf2769058b8fea02df411f0b066ca10b544251d31b86ca2bb5ac250e  packages\ui\src\components\avatar.tsx
112a05bafc5ab431acb74bb0e703921ab1bdf478026e2ccb0c19fd9450b7ee77  packages\ui\src\components\avatar.stories.tsx
fe422bc2ebe5f5fdb4f0a905fdb06482107f507ba08a306a7855a19b207b6287  packages\ui\src\components\alert.tsx
0455c5b835244393d8463fe647ca43144c9dae048a60d22a810559cfd77f0ae3  packages\ui\src\components\alert.stories.tsx
8e52e0f39dbda03478f1a54df477ea6a897cc62017ef945ed4828eecd119a9eb  packages\ui\src\components\alert-dialog.tsx
bbfd45040804e8347ce19f60479e8fdd652d54354613df935b7055cfbcda8eab  packages\ui\src\components\accordion.tsx
8f827846e9e814b88a52b6985e05206a97299d955b32110ae2d25775fcaddb00  packages\ui\src\components\accordion.stories.tsx
74e8fe9d0d680c442ed6adb13e7d119d6c210c19ae6c114313b2a72552be0883  packages\ui\src\lib\utils.ts
807ec6b577f8f8bcbf996d0a75d6f0fba0d82440c49a02a9f50f1eefba7c25cc  packages\ui\src\lib\icon-mapping.ts
11e08822fe0288075d74528c0581a319fca6ef5bea0faa1941bdaf3b1cb1d579  packages\ui\__tests__\utils.test.ts
236f04d4d7cbda0ae557383d0743fa39672119892ccd09164f23252f0f529f83  packages\ui\__tests__\tooltip.test.tsx
173efe567e609ab1c55c7b3189e0782ac1f4aae7b7dab064d975df23ec3f7fc7  packages\ui\__tests__\toast.test.tsx
b3252d10cc541b284913ad8cb234e70800a4e73e8beff937ec5fb4ba9bc9b8f2  packages\ui\__tests__\textarea.test.tsx
54a7c637dce606f69a4aa43325fb545c28ee3e7c8d96defdfb203e2f879391c7  packages\ui\__tests__\tabs.test.tsx
f9e8564d6b2edeae6f214eb515016828528cd98d64522a399c09cae31efa78d8  packages\ui\__tests__\table.test.tsx
d54cd55009f470d5dac22dfdc81743a1abdf05b9aede8fa594bb24cd29b21a40  packages\ui\__tests__\switch.test.tsx
47a85e229f1dd6ffa735751a9058f80e9bc6b497daca0f7cebcd0e3ab1f2306d  packages\ui\__tests__\status-badge.test.tsx
ac4dde46418b38b94057959c45e399b6e458cbff48f5a54f7289cc76167b3b41  packages\ui\__tests__\status-badge-review.test.tsx
5fdf22a76f8a9088a34e2c7677a8ec3215a2af704b6e4ef4552a011fca2dc98d  packages\ui\__tests__\slider.test.tsx
f53288b48d9f0f1c03601d66ea60662a13222f8219e14488a87988f863d9e69b  packages\ui\__tests__\skeleton.test.tsx
033487ea3d9256d4495bfb48581187c84d989a393d417d92960af9d28e55c314  packages\ui\__tests__\setup.ts
624d99df5967887b2e62369f9a78b4e31b0643703a950d626aa7691972c16e25  packages\ui\__tests__\separator.test.tsx
969c883ce4cdc9dd2c73152c951fefe433595139f41737df7242f519267ad8af  packages\ui\__tests__\select.test.tsx
213ec8bbe9f29ce5aa5ebf5761586283414ede5eb63887f88a5b0d6f3979f8b3  packages\ui\__tests__\search-input.test.tsx
531dd26ac6654a2ccdc2c216f6ed5ba81679e5af68544f27838b5ff9e984914a  packages\ui\__tests__\scroll-area.test.tsx
e1a1c7b97f572f85f2e4c4347b68a69b9163465ea106847176ae91baa22d2af7  packages\ui\__tests__\score-utils.test.ts
87f65de163832a6b78aa99216cf8bff4581f92b100915cef4b90bedae08030a7  packages\ui\__tests__\score-factor.test.tsx
15d877956cba7424081cf094949b65691e82ee4034e1eeceda396144e101611e  packages\ui\__tests__\score-factor-list.test.tsx
a5195576041cb137b2783a61993dd1317d604ab2b961f0c226538556bf09c285  packages\ui\__tests__\score-correction-modal.test.tsx
b68f187387dc5bdea1077f93139d482447fa99232dc0526b548d3a0e637f944e  packages\ui\__tests__\score-card.test.tsx
c1c334bc5b608a1aeb4fab1249cbec73f1aa9839c9c0542a968f63270372cfbb  packages\ui\__tests__\score-badge.test.tsx
159ef4d60bebf116c0c33691487f92f749be3af9111849c86e69c492055f18a0  packages\ui\__tests__\radio-group.test.tsx
0accdfd254000d22d15a86432c025e47239d20ce7ba875d4b301f62facf7f83a  packages\ui\__tests__\progress.test.tsx
5ea0f55fbb02e5a885673e755ee066f09d05e090f664c37a588c04230a5eb099  packages\ui\__tests__\popover.test.tsx
df49009d40e17922d89ca685abdc17f1822da3ea6a2559cd3619a67b1406a512  packages\ui\__tests__\pagination.test.tsx
5e76b2f52bf16841d3c7afed911581e9eb355f51c0e8dfb5e53998e8a04822d0  packages\ui\__tests__\model-info.test.tsx
7050a7a1045f3e2f76e6bf4f97662902a7cc47a2d278a05e6edd9fa10a389aa0  packages\ui\__tests__\metric-card.test.tsx
a135357fb12b52ca79865bae3c11684d1367bf318c9ddf2465fe863d5d8a4d0f  packages\ui\__tests__\layout-builder.test.tsx
bc54d2a24b08c205bb0f48e3483e6e6675668c9fd92be121b76370ce1b97e234  packages\ui\__tests__\label.test.tsx
4e36d3f0761c796aea8d8be318828ab7fc0aa7c5adc1da365f25388b00e3168a  packages\ui\__tests__\input.test.tsx
1ea3f0f1af5380bf9dd80b8acc8d9d6003bc510dd86b96fd2e890e960cddd0f0  packages\ui\__tests__\icon-badge.test.tsx
4c9528d09fa38a4e3fa253a66a2a567176d0524de325276e41bc70e03e94451d  packages\ui\__tests__\form.test.tsx
01a54bf5b9b3d87bb97edad62c0faf842e48857e4003ce55aeb6df19282b5b90  packages\ui\__tests__\error-state.test.tsx
d856b83900d6c34a0338b3af1a370ccbc1d9bbfcadf76ad3b08ddceee059b589  packages\ui\__tests__\entity-avatar.test.tsx
ca957d401fb759a9ddc5768996759ca0b5776bdaef1bf080f6a444f4b6d7ace5  packages\ui\__tests__\empty-state.test.tsx
1cf97c0151b7ffd9be445f2223aa22b16ef6bc6ed3cce35f84a76f77356b2241  packages\ui\__tests__\dropdown-menu.test.tsx
b78a2d337478c1472de3b04947723350ac7b273b3fec3a6427748f2906ad7a71  packages\ui\__tests__\dialog.test.tsx
68c9192cb04ff877a2b382f6be2fdaba8697e55337e7414e6fb3715c10a0aca4  packages\ui\__tests__\data-table.test.tsx
7a91e509e3ae5b54206cb1bf552fd309a82d36ba4cb842d9156cac0f6d3e4d46  packages\ui\__tests__\cookie-consent.test.tsx
12fbd909819ab52cff530eeb511f706b077d54a7babd314da67ba127646f882f  packages\ui\__tests__\confidence-indicator.test.tsx
79eb0b62c85e179442635e3549d2cd069ee3978948c860dae93866e9cc2d7c71  packages\ui\__tests__\checkbox.test.tsx
ccc6cf27d3dc425b57b60fbd796ee478020425de02dedbf318541b2eee43efdc  packages\ui\__tests__\card.test.tsx
5ea0bf10d9efd703a4f8cf7badb368b58cd90ced6da4e88112668c7c0fbbc378  packages\ui\__tests__\button.test.tsx
beb84028071ca3e2859245f04ee581534a3e87145e8add333e0b9cde4150e6e5  packages\ui\__tests__\badge.test.tsx
a5cd4b172a96e2e097945b30fc29f8ad4ee10381ac339bbb8cf4f1df715100ad  packages\ui\__tests__\avatar.test.tsx
02ca1de8c32e01809a6b9ae78d939e6cfd328af50f96ce923bb6724230638aa1  packages\ui\__tests__\alert.test.tsx
995a463741287d0acfab5eb5af3bae26c592087de719007817680a7de9da5c8e  packages\ui\__tests__\alert-dialog.test.tsx
875d114917c668ab29961a8c0317f002b7c9c41ca34481b6d7126f5b63736000  packages\ui\__tests__\accordion.test.tsx
c5fe1ddba209276a818195e678c9b5f19b6e1a08604a648c3271ed0932cee5a1  packages\ui\.storybook\preview.ts
87519f5609083ba4981a34243a06ed221ecc597530168096660a8864869eca94  packages\ui\.storybook\main.ts
b35ffae4c87f176d7b914b30f99204871d12c6859f680d4482e5650c11672e20  artifacts/misc/connector-status-dashboard.json
c5af37e8853f7ca9b26da02f79c95d3c83c19e74180b5368878fe5819da74eef  packages/adapters/src/erp/sap/client.ts
d10576f24414f967b30d7f70fd70ebe45154b11f4ea9b3a796784a6f426297e8  packages/adapters/src/payments/stripe/client.ts
0a8835209894d8a55b71d0c88b476514dca0d3d6889b1cc04e46a7afe9c4820e  packages/adapters/src/payments/paypal/client.ts
5182611bfef00c8d7a9ea7a22bd93736063ef057f8eb1647adcecc99a440154d  packages/adapters/src/email/gmail/client.ts
c3cf68a9ac752a28f10b70c8a3f3ccd6c4c6d81c188569401e17537a0a79fa08  packages/adapters/src/email/outlook/client.ts
f8a29be24f7e83392a61a52a75a4dc1f2eb979e0e2b70b17e14e0baad6696759  packages/adapters/src/messaging/slack/client.ts
869769d77c7d8fb5d4462a49aeaaae298b697adcf218c4377c398ee50b8655ba  packages/adapters/src/messaging/teams/client.ts
f976b2460a9a8ee5c20e9381d6db636b72de90cbe05b955851158d7952549bf2  packages/adapters/src/messaging/WebhookServiceAdapter.ts
c11f69688b2221b1675735b79ebd725057d679a21f66174d5f4e40ec8badea6e  packages/webhooks/package.json
d62c09838e3e594241b9a377a4efbb5655983d781c17f40240159c84957200f8  packages\webhooks\src\index.ts
4e5a692da61934d11bb81ee2b21043a097bbcc38b9630e7230dfb43342a25e5e  packages\webhooks\src\framework.ts
ef4a3ceacc6eb3ed1692931e947da185f91975aa3640e15a75016da1ee48c12c  .specify/sprints/sprint-10/attestations/IFC-099/context_ack.json
568317125740d9afaf408cde7622835947f00a35ade0468895af71d6e4d71478  docs/planning/prd-erp-connectors.md
3125fc19b1b3c2f0442c41eb7eb3c53b1745b909a858ce48d43131a357ddee24  artifacts/misc/vault-config.yaml
a2a7ad07958fbbb050d6a7feef05766d94cc7e542f0d250c77503bce99e29ff9  apps/api/src/security/encryption.ts
aaf8944095b6ebd25c66f88cc3ca89ac0f793b26f40d40deab8a6b2102bde32e  apps/api/src/security/key-rotation.ts
bd9f9a0bca3969203a13a28c331888af5af672d4d36220f64aa9edd0d6b6d5f5  docs/security/encryption-tests.md
fd910a628a3abe00c6a0440b979eedf22f5e2414d49d345b5229e642e5894b52  .specify/sprints/sprint-10/attestations/IFC-113/context_ack.json
f21daa70c2875c6804ffb77dd33f6c734fd952a5f0bd619ddc03d7c947cb3365  artifacts/misc/rotation-schedule.yaml
3c40128b02c3d4fbf9a292fa90fbe495388a029b91103549ae832f1c926ac8b2  docs/security/dependency-scan-report.md
12650116ddbe2747042c6d53c80fdb7c0f6a19699fd0d60073c618874e4036d2  .github/workflows/dependency-scan.yml
5e7a0a97f5cb940f332b0fa0e5a877ae6064313d34b442d7a87b467daccf4745  .specify/sprints/sprint-10/attestations/IFC-121/context_ack.json
7dd5b399d9314ae5a5a4893fc3d1dfa54041de00235bd493402283e1658be2fd  .specify/sprints/sprint-10/specifications/IFC-141-spec.md
91d099a58284ecac90b58706027c63ec60d21bac723d05a157a474596df3c960  .specify/sprints/sprint-10/planning/IFC-141-plan.md
5b16c860519d4a1b8c494a4d470185abbcf7823ae013b5f9c43b296edab7f62c  artifacts/misc/workflow-comparison-matrix.md
f37140421ff08fcd21b4a3098ac67006e5538890ef29b596a4438365848f0757  .specify/sprints/sprint-10/attestations/IFC-141/context_pack.md
5fff6e71ba18ff62c271b9c16c785f868da7ba70e4422e431cdf8700feaaa0d5  .specify/sprints/sprint-10/attestations/IFC-141/context_ack.json
af099805318857999e880cb12525ae8c88f5555b5a491cce62405d4ca18d2250  docs/planning/adr/ADR-014-workflow-engine-decision.md
7e4626a2650f1c92e33215d83d003693b8d4beab62f04e169aadd88589b55e62  artifacts/misc/events-spec.yaml
```

---

*Generated by sprint-completion-auditor at 2026-03-01T00:32:29.545Z*