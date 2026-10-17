import { CapacitorException } from '@capacitor/core';
import { describe, expect, it, vi } from 'vitest';

import type { CapacitorHealthPlugin, HealthErrorCode, NewSample } from './definitions';
import { withValidation } from './plugin';
import {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  parseDate,
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
  });

  it('rejects writes of types HealthKit disallows sharing', () => {
    for (const type of ['exerciseTime', 'walkingSteadiness', 'highHeartRateEvent', 'nikeFuel']) {
      rejection(() => validateCheckAuthorization({ write: [type as never] }, 'ios'), 'READ_ONLY_TYPE', 'write[0]');
    }
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
