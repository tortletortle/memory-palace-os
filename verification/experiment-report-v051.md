# V0.5.1 independent optimization experiment

## Protocol

- Pilot: 16 seeds per scenario; independent holdout: 64 seeds per scenario.
- Scenarios: stable_exponential, stable_power_law, abrupt_forgetting_shift, gradual_forgetting_shift, visual_shift, semantic_shift, stable_visual_dominant, stable_semantic_dominant.
- Sessions: 36; each run contains paired unaided and cued probes.
- Independent holdout runs: 512.
- Selected CUSUM threshold: 3.9; chosen on pilot data only, maximizing abrupt-shift detection within five sessions subject to pooled stable-scenario false-alert rate <= 10%.
- Primary metric: prequential Brier score (lower is better); log loss is secondary.
- Stable holdout pooled knowledge-channel false-alert rate: new detector 10.2%; legacy detector 3.1%.
- This is a synthetic algorithm stress test, not evidence of improved human memory.

## Pilot threshold sweep

- threshold 1.8: stable false alarms 85.9%; abrupt detection within five sessions 87.5%
- threshold 2.1: stable false alarms 70.3%; abrupt detection within five sessions 87.5%
- threshold 2.4: stable false alarms 45.3%; abrupt detection within five sessions 87.5%
- threshold 2.7: stable false alarms 31.3%; abrupt detection within five sessions 81.3%
- threshold 3: stable false alarms 25.0%; abrupt detection within five sessions 75.0%
- threshold 3.3: stable false alarms 15.6%; abrupt detection within five sessions 62.5%
- threshold 3.6: stable false alarms 12.5%; abrupt detection within five sessions 50.0%
- threshold 3.9: stable false alarms 7.8%; abrupt detection within five sessions 25.0%

## Independent holdout results

### stable_exponential
- Brier: legacyUnaided 0.1777; adaptiveUnaided 0.1783; fixedExpUnaided 0.1773; legacyCued 0.1582; separatedCued 0.1707
- Log loss: legacyUnaidedLogLoss 0.5368; adaptiveUnaidedLogLoss 0.5383; legacyCuedLogLoss 0.4962; separatedCuedLogLoss 0.5250
- Change detection: knowledgeAnyRate 6.3%; semanticAnyRate 3.1%; visualAnyRate 0.0%; legacyAnyRate 3.1%; knowledgeFalseAlarmRate 3.1%; knowledgeDetectWithin5 n/a; knowledgeDelayAfter21 n/a; semanticFalseAlarmRate 0.0%; semanticDetectWithin5 n/a; semanticDelayAfter21 n/a; visualFalseAlarmRate 0.0%; visualDetectWithin5 n/a; visualDelayAfter21 n/a

### stable_power_law
- Brier: legacyUnaided 0.2000; adaptiveUnaided 0.1992; fixedExpUnaided 0.1999; legacyCued 0.1707; separatedCued 0.1834
- Log loss: legacyUnaidedLogLoss 0.5878; adaptiveUnaidedLogLoss 0.5856; legacyCuedLogLoss 0.5251; separatedCuedLogLoss 0.5546
- Change detection: knowledgeAnyRate 15.6%; semanticAnyRate 4.7%; visualAnyRate 1.6%; legacyAnyRate 6.3%; knowledgeFalseAlarmRate 7.8%; knowledgeDetectWithin5 n/a; knowledgeDelayAfter21 n/a; semanticFalseAlarmRate 0.0%; semanticDetectWithin5 n/a; semanticDelayAfter21 n/a; visualFalseAlarmRate 0.0%; visualDetectWithin5 n/a; visualDelayAfter21 n/a

### abrupt_forgetting_shift
- Brier: legacyUnaided 0.2618; adaptiveUnaided 0.2441; fixedExpUnaided 0.2563; legacyCued 0.1882; separatedCued 0.2020
- Log loss: legacyUnaidedLogLoss 0.7242; adaptiveUnaidedLogLoss 0.6823; legacyCuedLogLoss 0.5627; separatedCuedLogLoss 0.5949
- Change detection: knowledgeAnyRate 78.1%; semanticAnyRate 3.1%; visualAnyRate 0.0%; legacyAnyRate 46.9%; knowledgeFalseAlarmRate 6.3%; knowledgeDetectWithin5 34.4%; knowledgeDelayAfter21 3.32; semanticFalseAlarmRate 0.0%; semanticDetectWithin5 n/a; semanticDelayAfter21 n/a; visualFalseAlarmRate 0.0%; visualDetectWithin5 n/a; visualDelayAfter21 n/a

### gradual_forgetting_shift
- Brier: legacyUnaided 0.2392; adaptiveUnaided 0.2348; fixedExpUnaided 0.2351; legacyCued 0.1770; separatedCued 0.1907
- Log loss: legacyUnaidedLogLoss 0.6763; adaptiveUnaidedLogLoss 0.6660; legacyCuedLogLoss 0.5373; separatedCuedLogLoss 0.5703
- Change detection: knowledgeAnyRate 48.4%; semanticAnyRate 3.1%; visualAnyRate 4.7%; legacyAnyRate 28.1%; knowledgeFalseAlarmRate 10.9%; knowledgeDetectWithin5 n/a; knowledgeDelayAfter21 n/a; semanticFalseAlarmRate 0.0%; semanticDetectWithin5 n/a; semanticDelayAfter21 n/a; visualFalseAlarmRate 0.0%; visualDetectWithin5 n/a; visualDelayAfter21 n/a

### visual_shift
- Brier: legacyUnaided 0.1731; adaptiveUnaided 0.1735; fixedExpUnaided 0.1720; legacyCued 0.2505; separatedCued 0.2418
- Log loss: legacyUnaidedLogLoss 0.5251; adaptiveUnaidedLogLoss 0.5262; legacyCuedLogLoss 0.7111; separatedCuedLogLoss 0.6798
- Change detection: knowledgeAnyRate 10.9%; semanticAnyRate 0.0%; visualAnyRate 71.9%; legacyAnyRate 1.6%; knowledgeFalseAlarmRate 3.1%; knowledgeDetectWithin5 n/a; knowledgeDelayAfter21 n/a; semanticFalseAlarmRate 0.0%; semanticDetectWithin5 n/a; semanticDelayAfter21 n/a; visualFalseAlarmRate 0.0%; visualDetectWithin5 31.3%; visualDelayAfter21 3.40

### semantic_shift
- Brier: legacyUnaided 0.1689; adaptiveUnaided 0.1694; fixedExpUnaided 0.1678; legacyCued 0.2712; separatedCued 0.2513
- Log loss: legacyUnaidedLogLoss 0.5149; adaptiveUnaidedLogLoss 0.5159; legacyCuedLogLoss 0.7601; separatedCuedLogLoss 0.6992
- Change detection: knowledgeAnyRate 9.4%; semanticAnyRate 68.8%; visualAnyRate 1.6%; legacyAnyRate 1.6%; knowledgeFalseAlarmRate 1.6%; knowledgeDetectWithin5 n/a; knowledgeDelayAfter21 n/a; semanticFalseAlarmRate 1.6%; semanticDetectWithin5 20.3%; semanticDelayAfter21 3.31; visualFalseAlarmRate 0.0%; visualDetectWithin5 n/a; visualDelayAfter21 n/a

### stable_visual_dominant
- Brier: legacyUnaided 0.1709; adaptiveUnaided 0.1713; fixedExpUnaided 0.1702; legacyCued 0.3174; separatedCued 0.2647
- Log loss: legacyUnaidedLogLoss 0.5198; adaptiveUnaidedLogLoss 0.5205; legacyCuedLogLoss 0.8646; separatedCuedLogLoss 0.7257
- Change detection: knowledgeAnyRate 6.3%; semanticAnyRate 0.0%; visualAnyRate 9.4%; legacyAnyRate 1.6%; knowledgeFalseAlarmRate 4.7%; knowledgeDetectWithin5 n/a; knowledgeDelayAfter21 n/a; semanticFalseAlarmRate 0.0%; semanticDetectWithin5 n/a; semanticDelayAfter21 n/a; visualFalseAlarmRate 6.3%; visualDetectWithin5 n/a; visualDelayAfter21 n/a

### stable_semantic_dominant
- Brier: legacyUnaided 0.1778; adaptiveUnaided 0.1786; fixedExpUnaided 0.1768; legacyCued 0.3175; separatedCued 0.2609
- Log loss: legacyUnaidedLogLoss 0.5345; adaptiveUnaidedLogLoss 0.5371; legacyCuedLogLoss 0.8657; separatedCuedLogLoss 0.7174
- Change detection: knowledgeAnyRate 12.5%; semanticAnyRate 7.8%; visualAnyRate 4.7%; legacyAnyRate 1.6%; knowledgeFalseAlarmRate 7.8%; knowledgeDetectWithin5 n/a; knowledgeDelayAfter21 n/a; semanticFalseAlarmRate 3.1%; semanticDetectWithin5 n/a; semanticDelayAfter21 n/a; visualFalseAlarmRate 0.0%; visualDetectWithin5 n/a; visualDelayAfter21 n/a

## Paired comparisons (64 paired seeds each)

- adaptiveVsLegacyUnaided: mean difference -0.0177, 95% CI [-0.0230, -0.0123]. Negative favors the first named predictor.
- adaptiveVsFixedUnaided: mean difference -0.0121, 95% CI [-0.0175, -0.0068]. Negative favors the first named predictor.
- separatedVsLegacyCuedSemantic: mean difference -0.0566, 95% CI [-0.0697, -0.0435]. Negative favors the first named predictor.
- separatedVsLegacyCuedVisual: mean difference -0.0527, 95% CI [-0.0656, -0.0399]. Negative favors the first named predictor.

## Interpretation

- Adaptive BMA reduces Brier error versus legacy BMA after abrupt forgetting change by 1.77 percentage points; the paired 95% CI excludes zero in this synthetic condition.
- The cause-separated cued model improves Brier error over legacy cued BMA in semantic- and visual-dominant stable scenarios; this depends on accurate explicit cause labels.
- Abrupt knowledge-change detection within five sessions: new hybrid detector 34.4% versus legacy detector 7.8%. The new detector is more sensitive in this scenario, but also has a higher stable false-alert rate (10.2% versus 3.1%). Visual and semantic channel detection remain incomplete; alerts remain advisory-only.
- Stable false-alert rates vary by forgetting family; pilot calibration does not guarantee identical holdout performance in every regime.

## Limitations

- Cause labels are generated and supplied as explicit synthetic annotations; real users need structured confusion reports or validated labels.
- Cue-support/interference factorization is simplified and may be misspecified when causes interact.
- BOCPD posterior is diagnostic; the alert requires sustained CUSUM evidence against a delay-conditioned baseline. It detects changes in an observed channel, not their psychological cause.
- The adaptive predictor retains the V0.5 legacy forecast as its stable-regime anchor and shifts weight only after confirmed or persistent evidence.
- Forecasts are prequential: each prediction uses only earlier observations. Threshold calibration uses pilot seeds; holdout uses an independent seed range.
- No algorithm automatically rewrites a scene or review schedule. Real-user calibration and prospective delayed-recall validation remain necessary.
