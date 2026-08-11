/* Offline fallback snapshots of the inventory sheets, keyed by project id.
 *
 * GENERATED — do not edit by hand. Run `node scripts/snapshot.js` to refresh.
 * Written: 2026-08-11T02:16:41.460Z
 *
 * The app uses the LIVE sheet whenever it can reach it. These are only shown
 * when the fetch fails, and the UI marks them as out of date when that happens.
 */
const SNAPSHOTS = {
  "emc": {
    takenAt: "2026-08-11T02:16:40.666Z",
    rows: 15,
    csv: "\"PROJECT\",\"Type\",\"Floor\",\"Unit Code\",\"Indoor area\",\"Indoor meter price\",\"Total unit price\",\"Status\"\n\"EMC\",\"CLINIC\",\"Third\",\"C313\",\"27\",\"125,000.00\",\"3,375,000.00\",\"Sold\"\n\"EMC\",\"CLINIC\",\"Third\",\"C314\",\"26\",\"125,000.00\",\"3,250,000.00\",\"Available\"\n\"EMC\",\"CLINIC\",\"Third\",\"C315\",\"26\",\"125,000.00\",\"3,250,000.00\",\"Available\"\n\"EMC\",\"CLINIC\",\"Third\",\"C316\",\"26\",\"125,000.00\",\"3,250,000.00\",\"Available\"\n\"EMC\",\"CLINIC\",\"Third\",\"C317\",\"26\",\"125,000.00\",\"3,250,000.00\",\"Available\"\n\"EMC\",\"CLINIC\",\"Third\",\"C318\",\"38\",\"100,000.00\",\"3,800,000.00\",\"Available\"\n\"EMC\",\"CLINIC\",\"Third\",\"C319\",\"41\",\"125,000.00\",\"5,125,000.00\",\"Available\"\n\"EMC\",\"CLINIC\",\"Third\",\"C320\",\"30\",\"130,000.00\",\"3,900,000.00\",\"Available\"\n\"EMC\",\"CLINIC\",\"Third\",\"C321\",\"33\",\"130,000.00\",\"4,290,000.00\",\"Available\"\n\"EMC\",\"CLINIC\",\"Third\",\"C329\",\"18\",\"100,000.00\",\"1,800,000.00\",\"Available\"\n\"EMC\",\"CLINIC\",\"Third\",\"C330\",\"18\",\"100,000.00\",\"1,800,000.00\",\"Available\"\n\"EMC\",\"CLINIC\",\"Third\",\"C331\",\"18\",\"100,000.00\",\"1,800,000.00\",\"Available\"\n\"EMC\",\"CLINIC\",\"Third\",\"C332\",\"18\",\"110,000.00\",\"1,980,000.00\",\"Available\"\n\"EMC\",\"CLINIC\",\"Third\",\"C333\",\"17\",\"115,000.00\",\"1,955,000.00\",\"Available\"\n\"EMC\",\"CLINIC\",\"Third\",\"C334\",\"22\",\"115,000.00\",\"2,530,000.00\",\"Available\"",
  },
  "mc9": {
    takenAt: "2026-08-11T02:16:41.459Z",
    rows: 22,
    csv: "\"PROJECT\",\"Type\",\"Floor\",\"Unit Code\",\"Indoor area\",\"Indoor meter price\",\"Total unit price\",\"Status\"\n\"9MC\",\"CLINIC\",\"NINETH\",\"MC915\",\"23\",\"80,000.00\",\"1,840,000.00\",\"Available\"\n\"9MC\",\"CLINIC\",\"NINETH\",\"MC916\",\"23\",\"80,000.00\",\"1,840,000.00\",\"Available\"\n\"9MC\",\"CLINIC\",\"NINETH\",\"MC917\",\"23\",\"80,000.00\",\"1,840,000.00\",\"Available\"\n\"9MC\",\"CLINIC\",\"NINETH\",\"MC918\",\"23\",\"80,000.00\",\"1,840,000.00\",\"Available\"\n\"9MC\",\"CLINIC\",\"NINETH\",\"MC919\",\"23\",\"80,000.00\",\"1,840,000.00\",\"Available\"\n\"9MC\",\"CLINIC\",\"NINETH\",\"MC921\",\"23\",\"80,000.00\",\"1,840,000.00\",\"Available\"\n\"9MC\",\"CLINIC\",\"NINETH\",\"MC922\",\"23\",\"80,000.00\",\"1,840,000.00\",\"Available\"\n\"9MC\",\"CLINIC\",\"NINETH\",\"MC923\",\"19\",\"80,000.00\",\"1,520,000.00\",\"Available\"\n\"9MC\",\"CLINIC\",\"NINETH\",\"MC924\",\"80\",\"80,000.00\",\"6,400,000.00\",\"Available\"\n\"9MC\",\"CLINIC\",\"NINETH\",\"MC925\",\"45\",\"80,000.00\",\"3,600,000.00\",\"Available\"\n\"9MC\",\"CLINIC\",\"NINETH\",\"MC926\",\"19\",\"82,000.00\",\"1,558,000.00\",\"Available\"\n\"9MC\",\"CLINIC\",\"NINETH\",\"MC927\",\"28\",\"82,000.00\",\"2,296,000.00\",\"Available\"\n\"9MC\",\"CLINIC\",\"NINETH\",\"MC928\",\"29\",\"82,000.00\",\"2,378,000.00\",\"Available\"\n\"9MC\",\"CLINIC\",\"NINETH\",\"MC929\",\"18\",\"80,000.00\",\"1,440,000.00\",\"Available\"\n\"9MC\",\"CLINIC\",\"NINETH\",\"MC930\",\"17\",\"85,000.00\",\"1,445,000.00\",\"Available\"\n\"9MC\",\"CLINIC\",\"NINETH\",\"MC931\",\"19\",\"85,000.00\",\"1,615,000.00\",\"Available\"\n\"9MC\",\"CLINIC\",\"NINETH\",\"MC932\",\"19\",\"85,000.00\",\"1,615,000.00\",\"Available\"\n\"9MC\",\"CLINIC\",\"NINETH\",\"MC933\",\"19\",\"85,000.00\",\"1,615,000.00\",\"Available\"\n\"9MC\",\"CLINIC\",\"NINETH\",\"MC934\",\"19\",\"85,000.00\",\"1,615,000.00\",\"Available\"\n\"9MC\",\"CLINIC\",\"NINETH\",\"MC935\",\"19\",\"85,000.00\",\"1,615,000.00\",\"Available\"\n\"9MC\",\"CLINIC\",\"NINETH\",\"MC936\",\"19\",\"85,000.00\",\"1,615,000.00\",\"Available\"\n\"9MC\",\"CLINIC\",\"NINETH\",\"MC937\",\"34\",\"85,000.00\",\"2,890,000.00\",\"Available\"",
  },
};

if (typeof module !== 'undefined') module.exports = { SNAPSHOTS };
