import { CapacitorException } from '@capacitor/core';
import { describe, expect, it, vi } from 'vitest';

import type { CapacitorHealthPlugin, HealthErrorCode, NewSample } from './definitions';
import { withValidation } from './plugin';
import {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  parseDate,
  validateAggregate,
  validateCheckAuthorization,
  validateDeleteSamples,
  validateGetChanges,
  validateReadSamples,
  validateRequestAuthorization,
  validateSaveSamples,
} from './validate';
import type { NativePlatform } from './validate';

const START = '2026-10-01T08:00:00+05:30';
const END = '2026-10-01T09:00:00+05:30';

/** Runs `fn`, expecting a rejection with `code` that names `field`. */
function rejection(fn: () => unknown, code: HealthErrorCode, field?: string, reason?: string) {
  let error: unknown;
  try {
    fn();
  } catch (e) {
    error = e;
  }
  expect(error, 'expected a rejection').toBeInstanceOf(CapacitorException);
  const e = error as CapacitorException;
  expect(e.code).toBe(code);
  if (field !== undefined) expect(e.data?.field).toBe(field);
  if (reason !== undefined) expect(e.data?.reason).toBe(reason);
  return e;
}

const save = (sample: Record<string, unknown>, platform: NativePlatform = 'ios') =>
  validateSaveSamples({ samples: [sample as unknown as NewSample] }, platform).samples[0] as unknown as Record<
    string,
    unknown
  >;

describe('parseDate', () => {
  it.each([
    ['2026-10-15T08:00:00+05:30', '2026-10-15T08:00:00.000+05:30'],
    ['2026-10-15T08:00+05:30', '2026-10-15T08:00:00.000+05:30'],
    ['2026-10-15T08:00:00Z', '2026-10-15T08:00:00.000+00:00'],
    ['2026-10-15T08:00:00.5-03:00', '2026-10-15T08:00:00.500-03:00'],
    ['2026-10-15T08:00:00.123456789+00:00', '2026-10-15T08:00:00.123+00:00'],
    ['2028-02-29T23:59:59+14:00', '2028-02-29T23:59:59.000+14:00'],
  ])('accepts %s', (input, iso) => {
    expect(parseDate(input, 'startDate').iso).toBe(iso);
  });

  it('keeps the calendar day as written', () => {
    expect(parseDate('2026-10-01T00:30:00+05:30', 'd').day).toBe('2026-10-01');
  });

  it.each([
    ['no offset', '2026-10-15T08:00:00'],
    ['date only', '2026-10-15'],
    ['not a string', 1760500000000],
    ['February 30', '2026-02-30T08:00:00Z'],
    ['February 29 in a common year', '2026-02-29T08:00:00Z'],
    ['month 13', '2026-13-01T08:00:00Z'],
    ['hour 24', '2026-10-15T24:00:00Z'],
    ['offset hours 19', '2026-10-15T08:00:00+19:00'],
    ['compact offset', '2026-10-15T08:00:00+0530'],
  ])('rejects %s', (_name, input) => {
    rejection(() => parseDate(input, 'startDate'), 'INVALID_ARGUMENT', 'startDate');
  });
});

describe('readSamples', () => {
  const base = { type: 'menstrualFlow', startDate: START, endDate: END } as const;

  it('fills defaults and normalizes dates', () => {
    expect(validateReadSamples(base, 'ios')).toEqual({
      type: 'menstrualFlow',
      startDate: '2026-10-01T08:00:00.000+05:30',
      endDate: '2026-10-01T09:00:00.000+05:30',
      limit: DEFAULT_LIMIT,
      ascending: true,
    });
  });

  it('passes cursor, unit, sourceIds and ascending through', () => {
    const result = validateReadSamples(
      {
        ...base,
        type: 'basalBodyTemperature',
        cursor: 'abc',
        unit: 'degF',
        sourceIds: ['com.example'],
        ascending: false,
        limit: MAX_LIMIT,
      },
      'android',
    );
    expect(result).toMatchObject({
      cursor: 'abc',
      unit: 'degF',
      sourceIds: ['com.example'],
      ascending: false,
      limit: MAX_LIMIT,
    });
  });

  it('rejects an unknown type', () => {
    rejection(
      () => validateReadSamples({ ...base, type: 'flightOfFancy' as never }, 'ios'),
      'UNSUPPORTED_TYPE',
      'type',
      'unknownType',
    );
    rejection(() => validateReadSamples({ ...base, type: 'constructor' as never }, 'ios'), 'UNSUPPORTED_TYPE', 'type');
  });

  it('rejects a type the platform lacks', () => {
    const e = rejection(
      () => validateReadSamples({ ...base, type: 'pregnancyTest' }, 'android'),
      'UNSUPPORTED_TYPE',
      'type',
      'notOnPlatform',
    );
    expect(e.data?.type).toBe('pregnancyTest');
    rejection(() => validateReadSamples({ ...base, type: 'skinTemperature' }, 'ios'), 'UNSUPPORTED_TYPE', 'type');
  });

  it('rejects a range that ends before it starts', () => {
    rejection(
      () => validateReadSamples({ ...base, startDate: END, endDate: START }, 'ios'),
      'INVALID_ARGUMENT',
      'endDate',
      'endBeforeStart',
    );
  });

  it('compares instants, not wall-clock times', () => {
    // 08:00 at +05:30 is 02:30Z, so 03:00Z is later even though it reads earlier.
    expect(() => validateReadSamples({ ...base, endDate: '2026-10-01T03:00:00Z' }, 'ios')).not.toThrow();
  });

  it.each([0, MAX_LIMIT + 1, 1.5, '10'])('rejects limit %s', (value) => {
    rejection(() => validateReadSamples({ ...base, limit: value as number }, 'ios'), 'INVALID_ARGUMENT', 'limit');
  });

  it('rejects a unit the type lacks', () => {
    rejection(
      () => validateReadSamples({ ...base, type: 'basalBodyTemperature', unit: 'K' }, 'ios'),
      'INVALID_ARGUMENT',
      'unit',
      'unknownUnit',
    );
    rejection(() => validateReadSamples({ ...base, unit: 'degC' }, 'ios'), 'INVALID_ARGUMENT', 'unit', 'notApplicable');
  });

  it('rejects malformed optional arguments', () => {
    rejection(() => validateReadSamples({ ...base, cursor: '' }, 'ios'), 'INVALID_ARGUMENT', 'cursor');
    rejection(() => validateReadSamples({ ...base, sourceIds: [] }, 'ios'), 'INVALID_ARGUMENT', 'sourceIds');
    rejection(() => validateReadSamples({ ...base, sourceIds: [''] }, 'ios'), 'INVALID_ARGUMENT', 'sourceIds[0]');
    rejection(
      () => validateReadSamples({ ...base, ascending: 'yes' as never }, 'ios'),
      'INVALID_ARGUMENT',
      'ascending',
    );
    rejection(() => validateReadSamples(null as never, 'ios'), 'INVALID_ARGUMENT', 'options');
  });
});

describe('getChanges', () => {
  it('fills defaults and removes duplicate types', () => {
    expect(validateGetChanges({ types: ['menstrualFlow', 'menstrualFlow', 'ovulationTest'] }, 'android')).toEqual({
      types: ['menstrualFlow', 'ovulationTest'],
      limit: DEFAULT_LIMIT,
      excludeOwnWrites: false,
    });
  });

  it('keeps cursor and options', () => {
    expect(
      validateGetChanges({ types: ['menstrualFlow'], cursor: 'c', limit: 5, excludeOwnWrites: true }, 'ios'),
    ).toEqual({ types: ['menstrualFlow'], cursor: 'c', limit: 5, excludeOwnWrites: true });
  });

  it('rejects empty, unknown and missing types', () => {
    rejection(() => validateGetChanges({ types: [] }, 'ios'), 'INVALID_ARGUMENT', 'types');
    rejection(() => validateGetChanges({ types: ['nope' as never] }, 'ios'), 'UNSUPPORTED_TYPE', 'types[0]');
    rejection(
      () => validateGetChanges({ types: ['menstrualFlow', 'acne'] }, 'android'),
      'UNSUPPORTED_TYPE',
      'types[1]',
    );
  });

  it('rejects a bad limit or flag', () => {
    rejection(() => validateGetChanges({ types: ['acne'], limit: 0 }, 'ios'), 'INVALID_ARGUMENT', 'limit');
    rejection(
      () => validateGetChanges({ types: ['acne'], excludeOwnWrites: 1 as never }, 'ios'),
      'INVALID_ARGUMENT',
      'excludeOwnWrites',
    );
  });
});

describe('authorization', () => {
  it('passes types missing on the platform through, so native can report them unsupported', () => {
    expect(
      validateCheckAuthorization({ read: ['menstrualFlow', 'pregnancyTest', 'menstrualFlow'] }, 'android'),
    ).toEqual({
      read: ['menstrualFlow', 'pregnancyTest'],
      write: [],
    });
  });

  it('rejects unknown types', () => {
    rejection(
      () => validateCheckAuthorization({ read: ['flightOfFancy' as never] }, 'ios'),
      'UNSUPPORTED_TYPE',
      'read[0]',
    );
  });

  it('rejects write access to read-only types', () => {
    const e = rejection(
      () => validateRequestAuthorization({ write: ['menstrualFlow', 'wristTemperature'] }, 'ios'),
      'READ_ONLY_TYPE',
      'write[1]',
    );
    expect(e.data?.type).toBe('wristTemperature');
    // wristTemperature doesn't exist on Android: reported unsupported there instead.
    expect(validateRequestAuthorization({ write: ['wristTemperature'] }, 'android').write).toEqual([
      'wristTemperature',
    ]);
  });

  it('needs at least one type', () => {
    rejection(() => validateCheckAuthorization({}, 'ios'), 'INVALID_ARGUMENT', 'read', 'noTypes');
    rejection(() => validateRequestAuthorization({ read: [], write: [] }, 'ios'), 'INVALID_ARGUMENT', 'read');
    rejection(
      () => validateRequestAuthorization({ read: 'menstrualFlow' as never }, 'ios'),
      'INVALID_ARGUMENT',
      'read',
    );
  });

  it('normalizes Android options', () => {
    expect(validateRequestAuthorization({ read: ['menstrualFlow'], android: { history: true } }, 'android')).toEqual({
      read: ['menstrualFlow'],
      write: [],
      android: { history: true, background: false },
    });
    rejection(
      () =>
        validateRequestAuthorization({ read: ['menstrualFlow'], android: { background: 'yes' as never } }, 'android'),
      'INVALID_ARGUMENT',
      'android.background',
    );
  });
});

describe('saveSamples', () => {
  it('rejects an empty or missing list', () => {
    rejection(() => validateSaveSamples({ samples: [] }, 'ios'), 'INVALID_ARGUMENT', 'samples');
    rejection(() => validateSaveSamples({} as never, 'ios'), 'INVALID_ARGUMENT', 'samples');
    rejection(() => validateSaveSamples({ samples: [null as never] }, 'ios'), 'INVALID_ARGUMENT', 'samples[0]');
  });

  describe('category samples', () => {
    it('defaults endDate, recordingMethod and the iOS cycle-start flag', () => {
      expect(save({ type: 'menstrualFlow', startDate: START, value: 'light' })).toEqual({
        type: 'menstrualFlow',
        startDate: '2026-10-01T08:00:00.000+05:30',
        endDate: '2026-10-01T08:00:00.000+05:30',
        value: 'light',
        isCycleStart: false,
        recordingMethod: 'unknown',
      });
    });

    it('has no cycle-start default on Android', () => {
      expect(save({ type: 'menstrualFlow', startDate: START, value: 'light' }, 'android')).not.toHaveProperty(
        'isCycleStart',
      );
    });

    it('rejects values outside the value set', () => {
      rejection(
        () => save({ type: 'menstrualFlow', startDate: START, value: 'spotting' }),
        'INVALID_ARGUMENT',
        'samples[0].value',
        'unknownValue',
      );
      rejection(() => save({ type: 'menstrualFlow', startDate: START }), 'INVALID_ARGUMENT', 'samples[0].value');
    });

    it('rejects values the platform can’t store', () => {
      rejection(
        () => save({ type: 'menstrualFlow', startDate: START, value: 'none' }, 'android'),
        'INVALID_ARGUMENT',
        'samples[0].value',
        'valueUnsupportedOnPlatform',
      );
      rejection(
        () => save({ type: 'cervicalMucus', startDate: START, value: 'unusual' }, 'ios'),
        'INVALID_ARGUMENT',
        'samples[0].value',
        'valueUnsupportedOnPlatform',
      );
      expect(save({ type: 'menstrualFlow', startDate: START, value: 'none' }, 'ios').value).toBe('none');
      expect(save({ type: 'cervicalMucus', startDate: START, value: 'unusual' }, 'android').value).toBe('unusual');
    });

    it('never echoes the rejected value', () => {
      const e = rejection(
        () => save({ type: 'menstrualFlow', startDate: START, value: 'secret-heavy' }),
        'INVALID_ARGUMENT',
      );
      expect(e.message).not.toContain('secret');
    });

    it('rejects fields the platform can’t store', () => {
      rejection(
        () => save({ type: 'menstrualFlow', startDate: START, value: 'light', isCycleStart: true }, 'android'),
        'INVALID_ARGUMENT',
        'samples[0].isCycleStart',
        'valueUnsupportedOnPlatform',
      );
      rejection(
        () => save({ type: 'cervicalMucus', startDate: START, value: 'dry', sensation: 'light' }, 'ios'),
        'INVALID_ARGUMENT',
        'samples[0].sensation',
        'valueUnsupportedOnPlatform',
      );
      expect(
        save({ type: 'cervicalMucus', startDate: START, value: 'dry', sensation: 'light' }, 'android').sensation,
      ).toBe('light');
    });

    it('rejects fields that don’t belong to the type', () => {
      rejection(
        () => save({ type: 'ovulationTest', startDate: START, value: 'negative', isCycleStart: true }),
        'INVALID_ARGUMENT',
        'samples[0].isCycleStart',
        'notApplicable',
      );
      rejection(
        () => save({ type: 'ovulationTest', startDate: START, value: 'negative', unit: 'degC' }),
        'INVALID_ARGUMENT',
        'samples[0].unit',
        'notApplicable',
      );
      rejection(
        () => save({ type: 'ovulationTest', startDate: START, value: 'negative', flow: {} }),
        'INVALID_ARGUMENT',
        'samples[0].flow',
      );
    });

    it('rejects a wrongly typed field', () => {
      rejection(
        () => save({ type: 'menstrualFlow', startDate: START, value: 'light', isCycleStart: 'yes' }),
        'INVALID_ARGUMENT',
        'samples[0].isCycleStart',
      );
    });
  });

  describe('time rules', () => {
    it('forces menopausalState to a single moment (R16b)', () => {
      const sample = save({ type: 'menopausalState', startDate: START, value: 'perimenopause' });
      expect(sample.endDate).toBe(sample.startDate);
      expect(save({ type: 'menopausalState', startDate: START, endDate: START, value: 'menopause' }).endDate).toBe(
        sample.startDate,
      );
      rejection(
        () => save({ type: 'menopausalState', startDate: START, endDate: END, value: 'menopause' }),
        'INVALID_ARGUMENT',
        'samples[0].endDate',
        'instantOnly',
      );
    });

    it('rejects intervals for Android instant records but allows them on iOS', () => {
      rejection(
        () => save({ type: 'sexualActivity', startDate: START, endDate: END }, 'android'),
        'INVALID_ARGUMENT',
        'samples[0].endDate',
        'instantOnly',
      );
      expect(save({ type: 'sexualActivity', startDate: START, endDate: END }, 'ios').endDate).toBe(
        '2026-10-01T09:00:00.000+05:30',
      );
    });

    it('rejects an end before the start', () => {
      rejection(
        () => save({ type: 'pregnancy', startDate: END, endDate: START }),
        'INVALID_ARGUMENT',
        'samples[0].endDate',
        'endBeforeStart',
      );
    });

    it('rejects a bad start date', () => {
      rejection(() => save({ type: 'pregnancy', startDate: '2026-10-01' }), 'INVALID_ARGUMENT', 'samples[0].startDate');
    });
  });

  describe('quantity samples', () => {
    it('defaults the unit and keeps the measurement location', () => {
      expect(
        save({ type: 'basalBodyTemperature', startDate: START, value: 36.4, measurementLocation: 'mouth' }),
      ).toMatchObject({
        value: 36.4,
        unit: 'degC',
        measurementLocation: 'mouth',
      });
    });

    it('rejects non-numbers and unknown units', () => {
      rejection(
        () => save({ type: 'basalBodyTemperature', startDate: START, value: '36.4' }),
        'INVALID_ARGUMENT',
        'samples[0].value',
      );
      rejection(
        () => save({ type: 'basalBodyTemperature', startDate: START, value: Number.NaN }),
        'INVALID_ARGUMENT',
        'samples[0].value',
      );
      rejection(
        () => save({ type: 'basalBodyTemperature', startDate: START, value: 36.4, unit: 'K' }),
        'INVALID_ARGUMENT',
        'samples[0].unit',
        'unknownUnit',
      );
    });

    it('checks locations against the platform', () => {
      rejection(
        () =>
          save({ type: 'basalBodyTemperature', startDate: START, value: 36.4, measurementLocation: 'vagina' }, 'ios'),
        'INVALID_ARGUMENT',
        'samples[0].measurementLocation',
        'valueUnsupportedOnPlatform',
      );
      rejection(
        () =>
          save({ type: 'basalBodyTemperature', startDate: START, value: 36.4, measurementLocation: 'body' }, 'android'),
        'INVALID_ARGUMENT',
        'samples[0].measurementLocation',
        'valueUnsupportedOnPlatform',
      );
    });

    it('rejects writes to read-only types', () => {
      rejection(
        () => save({ type: 'wristTemperature', startDate: START, value: 36 }),
        'READ_ONLY_TYPE',
        'samples[0].type',
      );
      rejection(
        () => save({ type: 'irregularMenstrualCycles', startDate: START }),
        'READ_ONLY_TYPE',
        'samples[0].type',
      );
    });
  });

  describe('event samples', () => {
    it('keeps protectionUsed', () => {
      expect(save({ type: 'sexualActivity', startDate: START, protectionUsed: true }, 'android').protectionUsed).toBe(
        true,
      );
    });

    it('rejects a value', () => {
      rejection(
        () => save({ type: 'intermenstrualBleeding', startDate: START, value: 'light' }),
        'INVALID_ARGUMENT',
        'samples[0].value',
        'notApplicable',
      );
    });
  });

  describe('common fields', () => {
    it('defaults clientVersion to 1 with a clientId', () => {
      expect(save({ type: 'pregnancy', startDate: START, clientId: 'p1' })).toMatchObject({
        clientId: 'p1',
        clientVersion: 1,
      });
      expect(save({ type: 'pregnancy', startDate: START, clientId: 'p1', clientVersion: 7 }).clientVersion).toBe(7);
    });

    it('rejects clientVersion without clientId, or a bad one', () => {
      rejection(
        () => save({ type: 'pregnancy', startDate: START, clientVersion: 2 }),
        'INVALID_ARGUMENT',
        'samples[0].clientVersion',
        'needsClientId',
      );
      rejection(
        () => save({ type: 'pregnancy', startDate: START, clientId: 'p', clientVersion: -1 }),
        'INVALID_ARGUMENT',
        'samples[0].clientVersion',
      );
      rejection(
        () => save({ type: 'pregnancy', startDate: START, clientId: '' }),
        'INVALID_ARGUMENT',
        'samples[0].clientId',
      );
    });

    it('checks recordingMethod, device and timeZone', () => {
      expect(
        save({
          type: 'pregnancy',
          startDate: START,
          recordingMethod: 'manual',
          device: { manufacturer: 'Acme', type: 'ring' },
          timeZone: 'Asia/Kolkata',
        }),
      ).toMatchObject({
        recordingMethod: 'manual',
        device: { manufacturer: 'Acme', type: 'ring' },
        timeZone: 'Asia/Kolkata',
      });
      rejection(
        () => save({ type: 'pregnancy', startDate: START, recordingMethod: 'typed' }),
        'INVALID_ARGUMENT',
        'samples[0].recordingMethod',
      );
      rejection(
        () => save({ type: 'pregnancy', startDate: START, device: { type: 'toaster' } }),
        'INVALID_ARGUMENT',
        'samples[0].device.type',
      );
      rejection(
        () => save({ type: 'pregnancy', startDate: START, device: { model: 3 } }),
        'INVALID_ARGUMENT',
        'samples[0].device.model',
      );
      rejection(
        () => save({ type: 'pregnancy', startDate: START, timeZone: 'Mars/Olympus' }),
        'INVALID_ARGUMENT',
        'samples[0].timeZone',
      );
    });

    it('names the failing sample by index', () => {
      rejection(
        () =>
          validateSaveSamples(
            {
              samples: [
                { type: 'pregnancy', startDate: START },
                { type: 'menstrualFlow', startDate: START, value: 'x' },
              ],
            },
            'ios',
          ),
        'INVALID_ARGUMENT',
        'samples[1].value',
      );
    });
  });

  describe('menstruationPeriod', () => {
    const period = {
      type: 'menstruationPeriod',
      startDate: '2026-10-01T00:00:00+05:30',
      endDate: '2026-10-05T00:00:00+05:30',
    };

    it('accepts a period with per-day flow', () => {
      expect(save({ ...period, flow: { '2026-10-01': 'heavy', '2026-10-05': 'light' } }, 'android')).toMatchObject({
        flow: { '2026-10-01': 'heavy', '2026-10-05': 'light' },
      });
    });

    it('accepts a one-day period', () => {
      expect(() => save({ ...period, endDate: period.startDate })).not.toThrow();
    });

    it('needs an end date', () => {
      rejection(() => save({ ...period, endDate: undefined }), 'INVALID_ARGUMENT', 'samples[0].endDate', 'required');
    });

    it('limits Android periods to 31 days (decision #30)', () => {
      expect(() => save({ ...period, endDate: '2026-10-31T00:00:00+05:30' }, 'android')).not.toThrow();
      rejection(
        () => save({ ...period, endDate: '2026-11-01T00:00:00+05:30' }, 'android'),
        'INVALID_ARGUMENT',
        'samples[0].endDate',
        'periodTooLong',
      );
      expect(() => save({ ...period, endDate: '2026-11-01T00:00:00+05:30' }, 'ios')).not.toThrow();
    });

    it('rejects flow outside the period or unsupported on the platform', () => {
      rejection(
        () => save({ ...period, flow: { '2026-10-06': 'light' } }),
        'INVALID_ARGUMENT',
        'samples[0].flow.2026-10-06',
        'dayOutsidePeriod',
      );
      rejection(
        () => save({ ...period, flow: { 'Oct 1': 'light' } }),
        'INVALID_ARGUMENT',
        'samples[0].flow.Oct 1',
        'dayOutsidePeriod',
      );
      rejection(
        () => save({ ...period, flow: { '2026-10-02': 'none' } }, 'android'),
        'INVALID_ARGUMENT',
        'samples[0].flow.2026-10-02',
        'valueUnsupportedOnPlatform',
      );
    });

    it('rejects sample-only fields', () => {
      rejection(() => save({ ...period, value: 'light' }), 'INVALID_ARGUMENT', 'samples[0].value', 'notApplicable');
      rejection(() => save({ ...period, isCycleStart: true }), 'INVALID_ARGUMENT', 'samples[0].isCycleStart');
    });
  });

  describe('skinTemperature (Android only)', () => {
    const sample = {
      type: 'skinTemperature',
      startDate: '2026-10-01T00:00:00Z',
      endDate: '2026-10-01T08:00:00Z',
      baseline: 33.5,
      deltas: [{ time: '2026-10-01T01:00:00Z', delta: -0.2 }],
      measurementLocation: 'wrist',
    };

    it('accepts a valid sample', () => {
      expect(save(sample, 'android')).toMatchObject({ unit: 'degC', baseline: 33.5, measurementLocation: 'wrist' });
    });

    it('is unsupported on iOS', () => {
      rejection(() => save(sample, 'ios'), 'UNSUPPORTED_TYPE', 'samples[0].type', 'notOnPlatform');
    });

    it('rejects deltas outside the sample and a zero-length sample', () => {
      rejection(
        () => save({ ...sample, deltas: [{ time: sample.endDate, delta: 0.1 }] }, 'android'),
        'INVALID_ARGUMENT',
        'samples[0].deltas[0].time',
        'outsideSample',
      );
      rejection(
        () => save({ ...sample, endDate: sample.startDate }, 'android'),
        'INVALID_ARGUMENT',
        'samples[0].endDate',
        'endNotAfterStart',
      );
      rejection(() => save({ ...sample, deltas: undefined }, 'android'), 'INVALID_ARGUMENT', 'samples[0].deltas');
      rejection(
        () => save({ ...sample, deltas: [{ time: sample.startDate, delta: 'x' }] }, 'android'),
        'INVALID_ARGUMENT',
        'samples[0].deltas[0].delta',
      );
    });
  });
});

describe('M2 types', () => {
  it('validates the new typed fields per platform', () => {
    const vo2 = { type: 'vo2Max', startDate: START, value: 42 };
    expect(save({ ...vo2, testType: 'predictionStepTest' }).testType).toBe('predictionStepTest');
    expect(save({ ...vo2, measurementMethod: 'heartRateRatio' }, 'android').measurementMethod).toBe('heartRateRatio');
    rejection(
      () => save({ ...vo2, measurementMethod: 'heartRateRatio' }),
      'INVALID_ARGUMENT',
      'samples[0].measurementMethod',
      'valueUnsupportedOnPlatform',
    );
    const glucose = { type: 'bloodGlucose', startDate: START, value: 5.5, unit: 'mmol/L' };
    expect(save({ ...glucose, relationToMeal: 'afterMeal' })).toMatchObject({
      unit: 'mmol/L',
      relationToMeal: 'afterMeal',
    });
    rejection(
      () => save({ ...glucose, relationToMeal: 'fasting' }),
      'INVALID_ARGUMENT',
      'samples[0].relationToMeal',
      'valueUnsupportedOnPlatform',
    );
    expect(save({ ...glucose, relationToMeal: 'fasting', specimenSource: 'capillaryBlood' }, 'android')).toMatchObject({
      relationToMeal: 'fasting',
    });
    rejection(
      () => save({ ...glucose, testType: 'maxExercise' }),
      'INVALID_ARGUMENT',
      'samples[0].testType',
      'notApplicable',
    );
  });

  it('enforces HealthKit ranges and minimum durations on iOS', () => {
    const effort = { type: 'workoutEffortScore', startDate: START, value: 11 };
    rejection(() => save(effort), 'INVALID_ARGUMENT', 'samples[0].value', 'outOfRange');
    expect(save({ ...effort, value: 10 }).value).toBe(10);
    const audio = { type: 'headphoneAudioExposure', startDate: START, value: 70 };
    rejection(() => save(audio), 'INVALID_ARGUMENT', 'samples[0].endDate', 'intervalOnly');
    rejection(
      () => save({ ...audio, endDate: '2026-10-01T08:00:00.999+05:30' }),
      'INVALID_ARGUMENT',
      'samples[0].endDate',
      'intervalOnly',
    );
    expect(save({ ...audio, endDate: END }).endDate).toBe('2026-10-01T09:00:00.000+05:30');
  });

  it('checks Health Connect interval records and whole numbers on Android', () => {
    const steps = { type: 'steps', startDate: START, endDate: END, value: 1200 };
    expect(save(steps, 'android')).toMatchObject({ value: 1200, unit: 'count' });
    rejection(
      () => save({ ...steps, endDate: START }, 'android'),
      'INVALID_ARGUMENT',
      'samples[0].endDate',
      'intervalOnly',
    );
    rejection(
      () => save({ ...steps, value: 12.5 }, 'android'),
      'INVALID_ARGUMENT',
      'samples[0].value',
      'wholeNumberOnly',
    );
    expect(save({ ...steps, value: 12.5, endDate: START }).value).toBe(12.5);
    rejection(
      () => save({ type: 'weight', startDate: START, endDate: END, value: 70 }, 'android'),
      'INVALID_ARGUMENT',
      'samples[0].endDate',
      'instantOnly',
    );
  });

  it('writes series types as single points on Android', () => {
    const heartRate = { type: 'heartRate', startDate: START, value: 72 };
    expect(save(heartRate, 'android')).toMatchObject({
      value: 72,
      unit: 'count/min',
      endDate: save(heartRate, 'android').startDate,
    });
    rejection(
      () => save({ ...heartRate, endDate: END }, 'android'),
      'INVALID_ARGUMENT',
      'samples[0].endDate',
      'instantOnly',
    );
    rejection(
      () => save({ ...heartRate, value: 72.5 }, 'android'),
      'INVALID_ARGUMENT',
      'samples[0].value',
      'wholeNumberOnly',
    );
    expect(save({ ...heartRate, endDate: END, value: 72.5 }).value).toBe(72.5);
  });

  it('validates blood pressure readings', () => {
    const reading = { type: 'bloodPressure', startDate: START, systolic: 120, diastolic: 80 };
    expect(save(reading)).toMatchObject({
      systolic: 120,
      diastolic: 80,
      unit: 'mmHg',
      endDate: save(reading).startDate,
    });
    expect(save({ ...reading, endDate: END }).endDate).toBe('2026-10-01T09:00:00.000+05:30');
    rejection(
      () => save({ ...reading, endDate: END }, 'android'),
      'INVALID_ARGUMENT',
      'samples[0].endDate',
      'instantOnly',
    );
    rejection(() => save({ ...reading, systolic: undefined }), 'INVALID_ARGUMENT', 'samples[0].systolic');
    rejection(() => save({ ...reading, value: 120 }), 'INVALID_ARGUMENT', 'samples[0].value', 'notApplicable');
    rejection(() => save({ ...reading, unit: 'kPa' }), 'INVALID_ARGUMENT', 'samples[0].unit', 'unknownUnit');
    const android = save({ ...reading, bodyPosition: 'sittingDown', measurementLocation: 'leftUpperArm' }, 'android');
    expect(android).toMatchObject({ bodyPosition: 'sittingDown', measurementLocation: 'leftUpperArm' });
    rejection(
      () => save({ ...reading, bodyPosition: 'sittingDown' }),
      'INVALID_ARGUMENT',
      'samples[0].bodyPosition',
      'valueUnsupportedOnPlatform',
    );
  });

  it('requires an insulin delivery reason on iOS', () => {
    const insulin = { type: 'insulinDelivery', startDate: START, value: 2 };
    rejection(() => save(insulin), 'INVALID_ARGUMENT', 'samples[0].reason', 'required');
    expect(save({ ...insulin, reason: 'bolus' })).toMatchObject({ unit: 'IU', reason: 'bolus' });
  });

  it('accepts combined ids and their units', () => {
    expect(save({ type: 'distance', startDate: START, endDate: END, value: 2, unit: 'km' })).toMatchObject({
      type: 'distance',
      unit: 'km',
    });
    expect(validateReadSamples({ type: 'speed', startDate: START, endDate: END, unit: 'mph' }, 'ios').unit).toBe('mph');
    rejection(
      () => save({ type: 'distance', startDate: START, value: 2, unit: 'kcal' }),
      'INVALID_ARGUMENT',
      'samples[0].unit',
      'unknownUnit',
    );
  });

  it('rejects samples of aggregate-only types', () => {
    const range = { startDate: START, endDate: END };
    rejection(
      () => validateReadSamples({ type: 'totalEnergy', ...range }, 'ios'),
      'UNSUPPORTED_TYPE',
      'type',
      'aggregateOnly',
    );
    rejection(
      () => validateGetChanges({ types: ['basalEnergy'] }, 'android'),
      'UNSUPPORTED_TYPE',
      'types[0]',
      'aggregateOnly',
    );
    expect(validateReadSamples({ type: 'totalEnergy', ...range }, 'android').type).toBe('totalEnergy');
    expect(validateReadSamples({ type: 'basalEnergy', ...range }, 'ios').type).toBe('basalEnergy');
    expect(validateCheckAuthorization({ read: ['totalEnergy'] }, 'ios').read).toEqual(['totalEnergy']);
    rejection(() => save({ type: 'totalEnergy', startDate: START, value: 1 }), 'READ_ONLY_TYPE', 'samples[0].type');
    rejection(
      () => save({ type: 'basalEnergy', startDate: START, endDate: END, value: 1 }, 'android'),
      'READ_ONLY_TYPE',
    );
    rejection(
      () => validateReadSamples({ type: 'basalMetabolicRate', ...range }, 'ios'),
      'UNSUPPORTED_TYPE',
      'type',
      'notOnPlatform',
    );
    expect(save({ type: 'basalMetabolicRate', startDate: START, value: 1600, unit: 'kcal/d' }, 'android').unit).toBe(
      'kcal/d',
    );
  });

  it('rejects writes of types HealthKit disallows sharing', () => {
    for (const type of ['exerciseTime', 'walkingSteadiness', 'highHeartRateEvent', 'nikeFuel']) {
      rejection(() => validateCheckAuthorization({ write: [type as never] }, 'ios'), 'READ_ONLY_TYPE', 'write[0]');
    }
  });
});

describe('aggregate', () => {
  const range = { startDate: START, endDate: '2026-10-08T08:00:00+05:30' };
  const steps = { type: 'steps' as const, metrics: ['sum' as const], ...range };

  it('normalizes a valid request', () => {
    expect(validateAggregate(steps, 'ios')).toEqual({
      type: 'steps',
      startDate: '2026-10-01T08:00:00.000+05:30',
      endDate: '2026-10-08T08:00:00.000+05:30',
      metrics: ['sum'],
      unit: 'count',
    });
    const full = validateAggregate(
      {
        ...steps,
        type: 'heartRate',
        metrics: ['avg', 'max', 'avg'],
        bucket: { unit: 'day' },
        sourceIds: ['com.example.watch'],
      },
      'android',
    );
    expect(full).toMatchObject({ metrics: ['avg', 'max'], bucket: { unit: 'day', size: 1 } });
    expect(validateAggregate({ ...steps, type: 'distance', unit: 'km' }, 'ios').unit).toBe('km');
  });

  it('allows only the metrics the platform serves', () => {
    rejection(
      () => validateAggregate({ ...steps, metrics: ['avg'] }, 'ios'),
      'INVALID_ARGUMENT',
      'metrics[0]',
      'metricUnsupported',
    );
    rejection(() => validateAggregate({ ...steps, metrics: [] }, 'ios'), 'INVALID_ARGUMENT', 'metrics');
    expect(validateAggregate({ ...steps, type: 'heartRate', metrics: ['count'] }, 'android').metrics).toEqual([
      'count',
    ]);
    rejection(
      () => validateAggregate({ ...steps, type: 'heartRate', metrics: ['count'] }, 'ios'),
      'INVALID_ARGUMENT',
      'metrics[0]',
      'metricUnsupported',
    );
  });

  it('serves aggregate-only types and rejects types without aggregates', () => {
    expect(validateAggregate({ ...steps, type: 'totalEnergy' }, 'ios').type).toBe('totalEnergy');
    expect(validateAggregate({ ...steps, type: 'basalEnergy' }, 'android').type).toBe('basalEnergy');
    rejection(
      () => validateAggregate({ ...steps, type: 'menstrualFlow' }, 'ios'),
      'UNSUPPORTED_TYPE',
      'type',
      'notAggregatable',
    );
    rejection(
      () => validateAggregate({ ...steps, type: 'boneMass' }, 'ios'),
      'UNSUPPORTED_TYPE',
      'type',
      'notOnPlatform',
    );
  });

  it('checks the range, bucket and unit', () => {
    rejection(
      () => validateAggregate({ ...steps, endDate: START }, 'ios'),
      'INVALID_ARGUMENT',
      'endDate',
      'emptyRange',
    );
    rejection(
      () => validateAggregate({ ...steps, bucket: { unit: 'year' as never } }, 'ios'),
      'INVALID_ARGUMENT',
      'bucket.unit',
    );
    rejection(
      () => validateAggregate({ ...steps, bucket: { unit: 'day', size: 0 } }, 'ios'),
      'INVALID_ARGUMENT',
      'bucket.size',
    );
    rejection(
      () => validateAggregate({ ...steps, bucket: { unit: 'minute' } }, 'ios'),
      'INVALID_ARGUMENT',
      'bucket',
      'tooManyBuckets',
    );
    expect(validateAggregate({ ...steps, bucket: { unit: 'minute', size: 5 } }, 'ios').bucket).toEqual({
      unit: 'minute',
      size: 5,
    });
    expect(
      validateAggregate({ ...steps, endDate: '2030-01-01T00:00:00Z', bucket: { unit: 'month' } }, 'ios').bucket?.unit,
    ).toBe('month');
    rejection(() => validateAggregate({ ...steps, unit: 'kg' }, 'ios'), 'INVALID_ARGUMENT', 'unit', 'unknownUnit');
  });
});

describe('passthrough ids', () => {
  // Every quantity of the iOS 27 SDK is registered since T41; a newer identifier still passes through.
  const water = 'hk:HKQuantityTypeIdentifierSomethingFromTheFuture' as const;
  const coughing = 'hk:HKCategoryTypeIdentifierCoughing' as const;

  it('accepts hk: ids on iOS only', () => {
    expect(validateReadSamples({ type: water, startDate: START, endDate: END }, 'ios').type).toBe(water);
    expect(validateReadSamples({ type: water, startDate: START, endDate: END, unit: 'mL' }, 'ios').unit).toBe('mL');
    rejection(
      () => validateReadSamples({ type: water, startDate: START, endDate: END }, 'android'),
      'UNSUPPORTED_TYPE',
      'type',
      'notOnPlatform',
    );
    expect(validateGetChanges({ types: [water, 'steps'] }, 'ios').types).toEqual([water, 'steps']);
    expect(validateCheckAuthorization({ read: [water], write: [coughing] }, 'ios')).toEqual({
      read: [water],
      write: [coughing],
    });
  });

  it('checks the id syntax and rejects hc: ids for now', () => {
    rejection(
      () => validateReadSamples({ type: 'hk:StepCount' as never, startDate: START, endDate: END }, 'ios'),
      'UNSUPPORTED_TYPE',
      'type',
      'unknownType',
    );
    rejection(
      () => validateReadSamples({ type: 'hc:HydrationRecord', startDate: START, endDate: END }, 'android'),
      'UNSUPPORTED_TYPE',
      'type',
      'notOnPlatform',
    );
    rejection(
      () => validateReadSamples({ type: 'hc:hydration' as never, startDate: START, endDate: END }, 'android'),
      'UNSUPPORTED_TYPE',
      'type',
      'unknownType',
    );
  });

  it('writes native values', () => {
    expect(save({ type: water, startDate: START, value: 250, unit: 'mL' })).toMatchObject({ value: 250, unit: 'mL' });
    rejection(
      () => save({ type: water, startDate: START, value: 250 }),
      'INVALID_ARGUMENT',
      'samples[0].unit',
      'required',
    );
    rejection(
      () => save({ type: water, startDate: START, value: 250, unit: 'cups' }),
      'INVALID_ARGUMENT',
      'samples[0].unit',
      'unknownUnit',
    );
    expect(save({ type: coughing, startDate: START, endDate: END, value: 3 }).value).toBe(3);
    expect(save({ type: 'hk:HKCategoryTypeIdentifierHandwashingEvent', startDate: START, endDate: END }).value).toBe(0);
    rejection(() => save({ type: coughing, startDate: START, value: 'mild' }), 'INVALID_ARGUMENT', 'samples[0].value');
  });

  it('points registered identifiers to their unified id', () => {
    const error = rejection(
      () =>
        validateReadSamples({ type: 'hk:HKQuantityTypeIdentifierStepCount', startDate: START, endDate: END }, 'ios'),
      'INVALID_ARGUMENT',
      'type',
      'registeredType',
    );
    expect(error.data?.type).toBe('steps');
    rejection(
      () => validateCheckAuthorization({ write: ['hk:HKQuantityTypeIdentifierAppleExerciseTime'] }, 'ios'),
      'INVALID_ARGUMENT',
      'write[0]',
      'registeredType',
    );
    for (const [id, type] of [
      ['hk:HKQuantityTypeIdentifierDietaryWater', 'hydration'],
      ['hk:HKQuantityTypeIdentifierDietaryProtein', 'dietaryProtein'],
      ['hk:HKCategoryTypeIdentifierMindfulSession', 'mindfulSession'],
      ['hk:HKCategoryTypeIdentifierSleepAnalysis', 'sleepSession'],
    ] as const) {
      const registered = rejection(() => validateCheckAuthorization({ read: [id] }, 'ios'), 'INVALID_ARGUMENT');
      expect(registered.data?.type).toBe(type);
    }
    const member = 'hk:HKQuantityTypeIdentifierBloodPressureSystolic' as const;
    expect(rejection(() => validateCheckAuthorization({ read: [member] }, 'ios'), 'INVALID_ARGUMENT').data?.type).toBe(
      'bloodPressure',
    );
  });

  it("can't be aggregated", () => {
    rejection(
      () => validateAggregate({ type: water as never, startDate: START, endDate: END, metrics: ['sum'] }, 'ios'),
      'UNSUPPORTED_TYPE',
      'type',
      'notAggregatable',
    );
  });
});

describe('deleteSamples', () => {
  it('accepts exactly one selector', () => {
    expect(validateDeleteSamples({ type: 'menstrualFlow', ids: ['a'] }, 'ios')).toEqual({
      type: 'menstrualFlow',
      ids: ['a'],
    });
    expect(validateDeleteSamples({ type: 'menstrualFlow', clientIds: ['c'] }, 'ios')).toEqual({
      type: 'menstrualFlow',
      clientIds: ['c'],
    });
    expect(validateDeleteSamples({ type: 'menstrualFlow', startDate: START, endDate: END }, 'ios')).toMatchObject({
      startDate: '2026-10-01T08:00:00.000+05:30',
    });
  });

  it('rejects zero or several selectors', () => {
    rejection(() => validateDeleteSamples({ type: 'menstrualFlow' }, 'ios'), 'INVALID_ARGUMENT', 'ids', 'oneSelector');
    rejection(
      () => validateDeleteSamples({ type: 'menstrualFlow', ids: ['a'], clientIds: ['b'] }, 'ios'),
      'INVALID_ARGUMENT',
      'ids',
      'oneSelector',
    );
  });

  it('needs both ends of a range', () => {
    rejection(
      () => validateDeleteSamples({ type: 'menstrualFlow', startDate: START }, 'ios'),
      'INVALID_ARGUMENT',
      'endDate',
    );
  });

  it('rejects empty id lists and read-only types', () => {
    rejection(() => validateDeleteSamples({ type: 'menstrualFlow', ids: [] }, 'ios'), 'INVALID_ARGUMENT', 'ids');
    rejection(() => validateDeleteSamples({ type: 'wristTemperature', ids: ['a'] }, 'ios'), 'READ_ONLY_TYPE', 'type');
  });
});

describe('withValidation', () => {
  function fakeNative() {
    const resolved = () => vi.fn().mockResolvedValue({});
    return {
      isAvailable: resolved(),
      getSupportedTypes: resolved(),
      requestAuthorization: resolved(),
      checkAuthorization: resolved(),
      openHealthSettings: resolved(),
      openHealthConnectInstall: resolved(),
      readSamples: resolved(),
      getChanges: resolved(),
      saveSamples: resolved(),
      deleteSamples: resolved(),
    } satisfies Record<keyof CapacitorHealthPlugin, unknown>;
  }

  it('sends normalized options to native code', async () => {
    const native = fakeNative();
    const plugin = withValidation(native, () => 'ios');
    await plugin.readSamples({ type: 'menstrualFlow', startDate: START, endDate: END });
    expect(native.readSamples).toHaveBeenCalledWith(expect.objectContaining({ limit: DEFAULT_LIMIT, ascending: true }));
  });

  it('rejects without calling native code', async () => {
    const native = fakeNative();
    const plugin = withValidation(native, () => 'android');
    await expect(plugin.readSamples({ type: 'acne', startDate: START, endDate: END })).rejects.toMatchObject({
      code: 'UNSUPPORTED_TYPE',
    });
    expect(native.readSamples).not.toHaveBeenCalled();
  });

  it('skips validation on the web, where the stub rejects everything', async () => {
    const native = fakeNative();
    const plugin = withValidation(native, () => 'web');
    await plugin.deleteSamples({ type: 'menstrualFlow' });
    expect(native.deleteSamples).toHaveBeenCalledWith({ type: 'menstrualFlow' });
  });

  it('forwards every method', async () => {
    const native = fakeNative();
    const plugin = withValidation(native, () => 'ios');
    await plugin.isAvailable();
    await plugin.getSupportedTypes();
    await plugin.openHealthSettings();
    await plugin.openHealthConnectInstall();
    await plugin.requestAuthorization({ read: ['acne'] });
    await plugin.checkAuthorization({ write: ['acne'] });
    await plugin.readSamples({ type: 'acne', startDate: START, endDate: END });
    await plugin.getChanges({ types: ['acne'] });
    await plugin.saveSamples({ samples: [{ type: 'acne', startDate: START, value: 'mild' }] });
    await plugin.deleteSamples({ type: 'acne', ids: ['x'] });
    for (const fn of Object.values(native)) expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('hydration, single nutrients and mindful sessions (T41)', () => {
  const range = { startDate: START, endDate: END };

  it('writes hydration in any volume unit, as an interval on Android', () => {
    expect(save({ type: 'hydration', startDate: START, value: 8, unit: 'flOz' })).toMatchObject({ unit: 'flOz' });
    expect(save({ type: 'hydration', startDate: START, value: 250 }).unit).toBe('mL');
    rejection(
      () => save({ type: 'hydration', startDate: START, value: 250 }, 'android'),
      'INVALID_ARGUMENT',
      'samples[0].endDate',
      'intervalOnly',
    );
    expect(save({ type: 'hydration', ...range, value: 250 }, 'android').value).toBe(250);
  });

  it('keeps single nutrients to samples on iOS and aggregates on Android', () => {
    expect(save({ type: 'dietaryProtein', ...range, value: 30 }).unit).toBe('g');
    expect(save({ type: 'dietaryVitaminC', ...range, value: 90, unit: 'mg' }).unit).toBe('mg');
    expect(save({ type: 'dietaryEnergy', ...range, value: 500, unit: 'kJ' }).unit).toBe('kJ');
    rejection(() => save({ type: 'dietaryProtein', ...range, value: 30 }, 'android'), 'READ_ONLY_TYPE');
    rejection(
      () => validateReadSamples({ type: 'dietaryProtein', ...range }, 'android'),
      'UNSUPPORTED_TYPE',
      'type',
      'aggregateOnly',
    );
    expect(validateAggregate({ type: 'dietaryProtein', ...range, metrics: ['sum'] }, 'android').type).toBe(
      'dietaryProtein',
    );
    rejection(
      () => validateReadSamples({ type: 'dietaryTransFat', ...range }, 'ios'),
      'UNSUPPORTED_TYPE',
      'type',
      'notOnPlatform',
    );
  });

  it('stores the mindful session type on Android only', () => {
    expect(save({ type: 'mindfulSession', ...range, sessionType: 'breathing' }, 'android').sessionType).toBe(
      'breathing',
    );
    rejection(
      () => save({ type: 'mindfulSession', ...range, sessionType: 'breathing' }),
      'INVALID_ARGUMENT',
      'samples[0].sessionType',
      'valueUnsupportedOnPlatform',
    );
    rejection(
      () => save({ type: 'mindfulSession', ...range, sessionType: 'yoga' }, 'android'),
      'INVALID_ARGUMENT',
      'samples[0].sessionType',
    );
    expect(save({ type: 'mindfulSession', ...range }).type).toBe('mindfulSession');
    for (const platform of ['ios', 'android'] as const) {
      rejection(
        () => validateAggregate({ type: 'mindfulSession', ...range, metrics: ['duration'] }, platform),
        'UNSUPPORTED_TYPE',
      );
    }
  });
});

describe('sleepSession (T43)', () => {
  const night = { type: 'sleepSession', startDate: '2026-10-01T22:00:00+05:30', endDate: '2026-10-02T07:00:00+05:30' };
  const stage = (value: string, start: string, end: string) => ({
    stage: value,
    startDate: `2026-10-0${start}+05:30`,
    endDate: `2026-10-0${end}+05:30`,
  });

  it('sorts the stages and normalizes their dates', () => {
    const saved = save({
      ...night,
      stages: [stage('deep', '2T01:00:00', '2T02:00:00'), stage('light', '1T22:30:00', '2T01:00:00')],
      clientId: 'night-1',
    });
    expect(saved).toMatchObject({
      type: 'sleepSession',
      startDate: '2026-10-01T22:00:00.000+05:30',
      clientId: 'night-1',
      clientVersion: 1,
    });
    expect(saved.stages).toEqual([
      { stage: 'light', startDate: '2026-10-01T22:30:00.000+05:30', endDate: '2026-10-02T01:00:00.000+05:30' },
      { stage: 'deep', startDate: '2026-10-02T01:00:00.000+05:30', endDate: '2026-10-02T02:00:00.000+05:30' },
    ]);
    expect(save(night, 'android').stages).toEqual([]);
  });

  it('applies Health Connect stage rules on both platforms', () => {
    for (const platform of ['ios', 'android'] as const) {
      rejection(
        () => save({ ...night, stages: [stage('rem', '1T21:00:00', '1T23:00:00')] }, platform),
        'INVALID_ARGUMENT',
        'samples[0].stages[0]',
        'outsideSession',
      );
      rejection(
        () =>
          save(
            {
              ...night,
              stages: [stage('light', '1T23:00:00', '2T01:00:00'), stage('deep', '2T00:30:00', '2T02:00:00')],
            },
            platform,
          ),
        'INVALID_ARGUMENT',
        'samples[0].stages[1]',
        'stagesOverlap',
      );
      rejection(
        () => save({ ...night, stages: [stage('awake', '2T03:00:00', '2T03:00:00')] }, platform),
        'INVALID_ARGUMENT',
        'samples[0].stages[0].endDate',
        'endNotAfterStart',
      );
    }
  });

  it('needs an end after the start', () => {
    rejection(() => save({ ...night, endDate: undefined }), 'INVALID_ARGUMENT', 'samples[0].endDate', 'required');
    rejection(
      () => save({ ...night, endDate: night.startDate }),
      'INVALID_ARGUMENT',
      'samples[0].endDate',
      'endNotAfterStart',
    );
  });

  it('keeps Android-only stages and fields off iOS', () => {
    const outOfBed = { ...night, stages: [stage('outOfBed', '2T03:00:00', '2T03:10:00')] };
    expect(save(outOfBed, 'android').stages).toHaveLength(1);
    rejection(() => save(outOfBed), 'INVALID_ARGUMENT', 'samples[0].stages[0].stage', 'valueUnsupportedOnPlatform');
    rejection(
      () => save({ ...night, stages: [stage('napping', '2T03:00:00', '2T03:10:00')] }),
      'INVALID_ARGUMENT',
      'samples[0].stages[0].stage',
      'unknownValue',
    );
    expect(save({ ...night, title: 'Night', notes: 'Noisy' }, 'android')).toMatchObject({
      title: 'Night',
      notes: 'Noisy',
    });
    rejection(
      () => save({ ...night, title: 'Night' }),
      'INVALID_ARGUMENT',
      'samples[0].title',
      'valueUnsupportedOnPlatform',
    );
    rejection(() => save({ ...night, notes: 3 }, 'android'), 'INVALID_ARGUMENT', 'samples[0].notes');
    rejection(() => save({ ...night, value: 'asleep' }), 'INVALID_ARGUMENT', 'samples[0].value', 'notApplicable');
    rejection(
      () => save({ type: 'steps', startDate: START, endDate: END, value: 1, stages: [] }),
      'INVALID_ARGUMENT',
      'samples[0].stages',
      'notApplicable',
    );
  });

  it('aggregates time asleep on iOS (Android follows in T45)', () => {
    expect(validateAggregate({ type: 'sleepSession', ...night, metrics: ['duration'] }, 'ios')).toMatchObject({
      type: 'sleepSession',
      metrics: ['duration'],
    });
    rejection(
      () => validateAggregate({ type: 'sleepSession', ...night, metrics: ['sum'] }, 'ios'),
      'INVALID_ARGUMENT',
      'metrics[0]',
      'metricUnsupported',
    );
    rejection(
      () => validateAggregate({ type: 'sleepSession', ...night, metrics: ['duration'], unit: 'min' }, 'ios'),
      'INVALID_ARGUMENT',
      'unit',
      'notApplicable',
    );
  });

  it('points the HealthKit identifier to the session type', () => {
    rejection(
      () =>
        validateReadSamples(
          { type: 'hk:HKCategoryTypeIdentifierSleepAnalysis', startDate: START, endDate: END },
          'ios',
        ),
      'INVALID_ARGUMENT',
      'type',
      'registeredType',
    );
    expect(validateReadSamples({ type: 'sleepSession', startDate: START, endDate: END }, 'android').type).toBe(
      'sleepSession',
    );
  });
});

describe('workout (T46)', () => {
  const run = { type: 'workout', activityType: 'running', startDate: START, endDate: END };
  const at = (minute: number) =>
    `2026-10-01T${String(8 + Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}:00+05:30`;
  const span = (from: number, to: number, extra: Record<string, unknown> = {}) => ({
    startDate: at(from),
    endDate: at(to),
    ...extra,
  });

  it('normalizes a workout and sorts its segments and laps', () => {
    const saved = save(
      {
        ...run,
        totals: { energy: 420, distance: 8000 },
        segments: [span(30, 35, { segmentType: 'pause' }), span(0, 30, { segmentType: 'running', repetitions: 0 })],
        laps: [span(20, 40, { length: 4000 }), span(0, 20, { length: 4000 })],
        title: 'Morning run',
        clientId: 'run-1',
      },
      'android',
    );
    expect(saved).toMatchObject({
      type: 'workout',
      activityType: 'running',
      startDate: '2026-10-01T08:00:00.000+05:30',
      endDate: '2026-10-01T09:00:00.000+05:30',
      totals: { energy: 420, distance: 8000 },
      title: 'Morning run',
      clientId: 'run-1',
      clientVersion: 1,
    });
    expect(saved.segments).toEqual([
      {
        startDate: '2026-10-01T08:00:00.000+05:30',
        endDate: '2026-10-01T08:30:00.000+05:30',
        segmentType: 'running',
        repetitions: 0,
      },
      { startDate: '2026-10-01T08:30:00.000+05:30', endDate: '2026-10-01T08:35:00.000+05:30', segmentType: 'pause' },
    ]);
    expect((saved.laps as { startDate: string }[]).map((lap) => lap.startDate)).toEqual([
      '2026-10-01T08:00:00.000+05:30',
      '2026-10-01T08:20:00.000+05:30',
    ]);
    expect(save(run)).toMatchObject({ segments: [], laps: [] });
    expect(save(run).totals).toBeUndefined();
  });

  it('needs an activity this platform stores and an end after the start', () => {
    rejection(
      () => save({ ...run, activityType: undefined }),
      'INVALID_ARGUMENT',
      'samples[0].activityType',
      'unknownValue',
    );
    rejection(
      () => save({ ...run, activityType: 'parkour' }),
      'INVALID_ARGUMENT',
      'samples[0].activityType',
      'unknownValue',
    );
    rejection(
      () => save({ ...run, activityType: 'toString' }),
      'INVALID_ARGUMENT',
      'samples[0].activityType',
      'unknownValue',
    );
    // archery is iOS-only, guidedBreathing Android-only (decision #62).
    expect(save({ ...run, activityType: 'archery' }).activityType).toBe('archery');
    rejection(
      () => save({ ...run, activityType: 'archery' }, 'android'),
      'INVALID_ARGUMENT',
      'samples[0].activityType',
      'valueUnsupportedOnPlatform',
    );
    rejection(
      () => save({ ...run, activityType: 'guidedBreathing' }),
      'INVALID_ARGUMENT',
      'samples[0].activityType',
      'valueUnsupportedOnPlatform',
    );
    rejection(() => save({ ...run, endDate: undefined }), 'INVALID_ARGUMENT', 'samples[0].endDate', 'required');
    rejection(() => save({ ...run, endDate: START }), 'INVALID_ARGUMENT', 'samples[0].endDate', 'endNotAfterStart');
  });

  it("applies Health Connect's segment and lap rules on both platforms", () => {
    for (const platform of ['ios', 'android'] as const) {
      for (const part of ['segments', 'laps'] as const) {
        rejection(
          () => save({ ...run, [part]: [{ startDate: '2026-10-01T07:50:00+05:30', endDate: at(10) }] }, platform),
          'INVALID_ARGUMENT',
          `samples[0].${part}[0]`,
          'outsideSession',
        );
        rejection(
          () => save({ ...run, [part]: [span(10, 30), span(20, 40)] }, platform),
          'INVALID_ARGUMENT',
          `samples[0].${part}[1]`,
          `${part}Overlap`,
        );
        rejection(
          () => save({ ...run, [part]: [span(10, 10)] }, platform),
          'INVALID_ARGUMENT',
          `samples[0].${part}[0].endDate`,
          'endNotAfterStart',
        );
        expect(save({ ...run, [part]: [span(0, 30), span(30, 60)] }, platform)[part]).toHaveLength(2);
      }
      // A lap may cross a segment: Health Connect only checks laps against laps.
      expect(save({ ...run, segments: [span(0, 30)], laps: [span(20, 40)] }, platform).laps).toHaveLength(1);
      rejection(
        () => save({ ...run, laps: [span(0, 10, { length: 1_000_001 })] }, platform),
        'INVALID_ARGUMENT',
        'samples[0].laps[0].length',
        'outOfRange',
      );
      rejection(
        () => save({ ...run, laps: [span(0, 10, { length: -1 })] }, platform),
        'INVALID_ARGUMENT',
        'samples[0].laps[0].length',
        'outOfRange',
      );
    }
  });

  it("checks segment types against the activity on Android (ExerciseSegment's table)", () => {
    const withSegment = (activityType: string, segmentType: string) => ({
      ...run,
      activityType,
      segments: [span(0, 10, { segmentType })],
    });
    rejection(
      () => save(withSegment('running', 'cycling'), 'android'),
      'INVALID_ARGUMENT',
      'samples[0].segments[0].segmentType',
      'segmentNotAllowed',
    );
    // Any activity takes pause, rest, stretching and other (EXERCISE_SEGMENT_TYPE_OTHER_WORKOUT).
    for (const segmentType of ['pause', 'rest', 'stretching', 'other']) {
      expect(save(withSegment('golf', segmentType), 'android').segments).toHaveLength(1);
    }
    // Boot camp, HIIT and other workouts take every segment type.
    expect(save(withSegment('bootCamp', 'swimmingFreestyle'), 'android').segments).toHaveLength(1);
    expect(save(withSegment('other', 'cycling'), 'android').segments).toHaveLength(1);
    expect(save(withSegment('running', 'walking'), 'android').segments).toHaveLength(1);
    expect(save(withSegment('swimmingPool', 'swimmingButterfly'), 'android').segments).toHaveLength(1);
    expect(save(withSegment('strengthTraining', 'benchPress'), 'android').segments).toHaveLength(1);
    rejection(
      () => save(withSegment('yoga', 'benchPress'), 'android'),
      'INVALID_ARGUMENT',
      'samples[0].segments[0].segmentType',
      'segmentNotAllowed',
    );
    rejection(
      () => save(withSegment('running', 'sprint'), 'android'),
      'INVALID_ARGUMENT',
      'samples[0].segments[0].segmentType',
      'unknownValue',
    );
  });

  it('stores only pause segments, without repetitions, on iOS', () => {
    expect(save({ ...run, segments: [span(0, 10), span(10, 15, { segmentType: 'pause' })] }).segments).toEqual([
      { startDate: '2026-10-01T08:00:00.000+05:30', endDate: '2026-10-01T08:10:00.000+05:30' },
      { startDate: '2026-10-01T08:10:00.000+05:30', endDate: '2026-10-01T08:15:00.000+05:30', segmentType: 'pause' },
    ]);
    rejection(
      () => save({ ...run, segments: [span(0, 10, { segmentType: 'running' })] }),
      'INVALID_ARGUMENT',
      'samples[0].segments[0].segmentType',
      'valueUnsupportedOnPlatform',
    );
    rejection(
      () => save({ ...run, segments: [span(0, 10, { repetitions: 12 })] }),
      'INVALID_ARGUMENT',
      'samples[0].segments[0].repetitions',
      'valueUnsupportedOnPlatform',
    );
    for (const repetitions of [-1, 2.5, '12']) {
      rejection(
        () => save({ ...run, segments: [span(0, 10, { repetitions })] }, 'android'),
        'INVALID_ARGUMENT',
        'samples[0].segments[0].repetitions',
      );
    }
  });

  it('takes totals within Health Connect limits', () => {
    for (const platform of ['ios', 'android'] as const) {
      expect(save({ ...run, totals: { energy: 0, distance: 1_000_000 } }, platform).totals).toEqual({
        energy: 0,
        distance: 1_000_000,
      });
      expect(save({ ...run, totals: { energy: 300 } }, platform).totals).toEqual({ energy: 300 });
      rejection(
        () => save({ ...run, totals: { distance: 1_000_001 } }, platform),
        'INVALID_ARGUMENT',
        'samples[0].totals.distance',
        'outOfRange',
      );
      rejection(
        () => save({ ...run, totals: { energy: -5 } }, platform),
        'INVALID_ARGUMENT',
        'samples[0].totals.energy',
        'outOfRange',
      );
      rejection(
        () => save({ ...run, totals: { steps: 9000 } }, platform),
        'INVALID_ARGUMENT',
        'samples[0].totals.steps',
        'notApplicable',
      );
      rejection(() => save({ ...run, totals: 400 }, platform), 'INVALID_ARGUMENT', 'samples[0].totals');
    }
  });

  it('keeps activities on iOS and title / notes on Android', () => {
    const triathlon = {
      ...run,
      activityType: 'swimBikeRun',
      activities: [
        span(40, 60, { activityType: 'running' }),
        span(0, 20, { activityType: 'swimmingOpenWater' }),
        span(20, 40, { activityType: 'cycling' }),
      ],
    };
    expect((save(triathlon).activities as { activityType: string }[]).map((a) => a.activityType)).toEqual([
      'swimmingOpenWater',
      'cycling',
      'running',
    ]);
    rejection(
      () =>
        save({
          ...triathlon,
          activities: [span(0, 30, { activityType: 'running' }), span(20, 40, { activityType: 'cycling' })],
        }),
      'INVALID_ARGUMENT',
      'samples[0].activities[1]',
      'activitiesOverlap',
    );
    rejection(
      () => save({ ...triathlon, activities: [span(0, 30, { activityType: 'guidedBreathing' })] }),
      'INVALID_ARGUMENT',
      'samples[0].activities[0].activityType',
      'valueUnsupportedOnPlatform',
    );
    rejection(
      () => save({ ...run, activities: [] }, 'android'),
      'INVALID_ARGUMENT',
      'samples[0].activities',
      'valueUnsupportedOnPlatform',
    );
    expect(save({ ...run, title: 'Run', notes: 'Hills' }, 'android')).toMatchObject({ title: 'Run', notes: 'Hills' });
    rejection(
      () => save({ ...run, notes: 'Hills' }),
      'INVALID_ARGUMENT',
      'samples[0].notes',
      'valueUnsupportedOnPlatform',
    );
  });

  it('keeps workout fields off other types', () => {
    rejection(() => save({ ...run, value: 1 }), 'INVALID_ARGUMENT', 'samples[0].value', 'notApplicable');
    rejection(() => save({ ...run, stages: [] }), 'INVALID_ARGUMENT', 'samples[0].stages', 'notApplicable');
    rejection(
      () => save({ type: 'steps', startDate: START, endDate: END, value: 1, activityType: 'running' }),
      'INVALID_ARGUMENT',
      'samples[0].activityType',
      'notApplicable',
    );
    rejection(
      () =>
        save({
          type: 'sleepSession',
          startDate: START,
          endDate: END,
          laps: [],
        }),
      'INVALID_ARGUMENT',
      'samples[0].laps',
      'notApplicable',
    );
  });

  it('reads, deletes and follows workouts like other types, without aggregates', () => {
    for (const platform of ['ios', 'android'] as const) {
      expect(validateReadSamples({ type: 'workout', startDate: START, endDate: END }, platform).type).toBe('workout');
      expect(validateDeleteSamples({ type: 'workout', clientIds: ['run-1'] }, platform)).toEqual({
        type: 'workout',
        clientIds: ['run-1'],
      });
      rejection(
        () => validateAggregate({ type: 'workout', startDate: START, endDate: END, metrics: ['duration'] }, platform),
        'UNSUPPORTED_TYPE',
        'type',
        'notAggregatable',
      );
    }
  });
});
