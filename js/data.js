/* Offline fallback snapshots of the inventory sheets, keyed by project id.
 *
 * GENERATED — do not edit by hand. Run `node scripts/snapshot.js` to refresh.
 * Written: 2026-10-01T15:55:46.333Z
 *
 * The app uses the LIVE sheet whenever it can reach it. These are only shown
 * when the fetch fails, and the UI marks them as out of date when that happens.
 */
const SNAPSHOTS = {
  "emc": {
    takenAt: "2026-10-01T15:55:45.914Z",
    rows: 13,
    csv: "\"PROJECT\",\"Type\",\"Floor\",\"Unit Code\",\"Indoor area\",\"Indoor meter price\",\"Total unit price\",\"Status\"\n\"EMC\",\"CLINIC\",\"Third\",\"C313\",\"27\",\"125,000.00\",\"3,375,000.00\",\"Available \"\n\"EMC\",\"CLINIC\",\"Third\",\"C314\",\"26\",\"125,000.00\",\"3,250,000.00\",\"Available\"\n\"EMC\",\"CLINIC\",\"Third\",\"C315\",\"26\",\"125,000.00\",\"3,250,000.00\",\"Available\"\n\"EMC\",\"CLINIC\",\"Third\",\"C316\",\"26\",\"125,000.00\",\"3,250,000.00\",\"Available\"\n\"EMC\",\"CLINIC\",\"Third\",\"C318\",\"38\",\"100,000.00\",\"3,800,000.00\",\"Available\"\n\"EMC\",\"CLINIC\",\"Third\",\"C319\",\"41\",\"120,000.00\",\"4,920,000.00\",\"Available\"\n\"EMC\",\"CLINIC\",\"Third\",\"C320\",\"30\",\"130,000.00\",\"3,900,000.00\",\"Available\"\n\"EMC\",\"CLINIC\",\"Third\",\"C321\",\"33\",\"130,000.00\",\"4,290,000.00\",\"Available \"\n\"EMC\",\"CLINIC\",\"Third\",\"C329\",\"18\",\"100,000.00\",\"1,800,000.00\",\"Available\"\n\"EMC\",\"CLINIC\",\"Third\",\"C330\",\"18\",\"100,000.00\",\"1,800,000.00\",\"Available\"\n\"EMC\",\"CLINIC\",\"Third\",\"C331\",\"18\",\"100,000.00\",\"1,800,000.00\",\"Available\"\n\"EMC\",\"CLINIC\",\"Third\",\"C332\",\"18\",\"110,000.00\",\"1,980,000.00\",\"Available \"\n\"EMC\",\"CLINIC\",\"Third\",\"C333\",\"17\",\"115,000.00\",\"1,955,000.00\",\"Available\"",
  },
  "mc9": {
    takenAt: "2026-10-01T15:55:46.331Z",
    rows: 16,
    csv: "\"PROJECT\",\"Type\",\"Floor\",\"Unit Code\",\"Indoor area\",\"Indoor meter price\",\"Total unit price\",\"Status\"\n\"9MC\",\"CLINIC\",\"NINETH\",\"MC901\",\"38\",\"85,000.00\",\"3,230,000.00\",\"Available\"\n\"9MC\",\"CLINIC\",\"NINETH\",\"MC902\",\"61\",\"85,000.00\",\"5,185,000.00\",\"Available\"\n\"9MC\",\"CLINIC\",\"NINETH\",\"MC904\",\"21\",\"85,000.00\",\"1,785,000.00\",\"Available\"\n\"9MC\",\"CLINIC\",\"NINETH\",\"MC905\",\"21\",\"85,000.00\",\"1,785,000.00\",\"Available\"\n\"9MC\",\"CLINIC\",\"NINETH\",\"MC908\",\"23\",\"82,000.00\",\"1,886,000.00\",\"Available\"\n\"9MC\",\"CLINIC\",\"NINETH\",\"MC909\",\"23\",\"82,000.00\",\"1,886,000.00\",\"Available\"\n\"9MC\",\"CLINIC\",\"NINETH\",\"MC910\",\"23\",\"82,000.00\",\"1,886,000.00\",\"Available\"\n\"9MC\",\"CLINIC\",\"NINETH\",\"MC911\",\"23\",\"82,000.00\",\"1,886,000.00\",\"Available\"\n\"9MC\",\"CLINIC\",\"NINETH\",\"MC916\",\"23\",\"80,000.00\",\"1,840,000.00\",\"Available\"\n\"9MC\",\"CLINIC\",\"NINETH\",\"MC917\",\"23\",\"80,000.00\",\"1,840,000.00\",\"Available\"\n\"9MC\",\"CLINIC\",\"NINETH\",\"MC918\",\"23\",\"80,000.00\",\"1,840,000.00\",\"Available\"\n\"9MC\",\"CLINIC\",\"NINETH\",\"MC919\",\"23\",\"80,000.00\",\"1,840,000.00\",\"Available\"\n\"9MC\",\"CLINIC\",\"NINETH\",\"MC927\",\"29\",\"82,000.00\",\"2,378,000.00\",\"Available\"\n\"9MC\",\"CLINIC\",\"NINETH\",\"MC928\",\"33\",\"82,000.00\",\"2,706,000.00\",\"Available\"\n\"9MC\",\"CLINIC\",\"NINETH\",\"MC932\",\"19\",\"85,000.00\",\"1,615,000.00\",\"Available\"\n\"9MC\",\"CLINIC\",\"NINETH\",\"MC933\",\"19\",\"85,000.00\",\"1,615,000.00\",\"Available\"",
  },
};

if (typeof module !== 'undefined') module.exports = { SNAPSHOTS };
