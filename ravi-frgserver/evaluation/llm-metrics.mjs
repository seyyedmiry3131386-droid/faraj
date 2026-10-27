// Operational failures are not evidence that a model rejected a negative.
export function modelScores(positive, negative) {
  const pct=(n,d)=>d?+(n/d*100).toFixed(1):0;
  const usableNegative=negative.filter(row=>row.ok);
  const rejected=usableNegative.filter(row=>!row.modelFalse).length;
  return {
    modelAloneRecall:pct(positive.filter(row=>row.ok&&row.modelHit).length,positive.length),
    modelAloneControlRejection:pct(rejected,negative.length),
    modelControlRejectionOnUsable:usableNegative.length?pct(rejected,usableNegative.length):null,
  };
}
