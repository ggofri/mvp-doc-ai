import { TypeCoercionService } from '../TypeCoercionService';
import { getSchemaStore } from '../SchemaStore';

describe('TypeCoercionService', () => {
  let service: TypeCoercionService;

  beforeEach(() => {
    service = new TypeCoercionService();
  });

  describe('Schema Detection', () => {
    it('should retrieve Bank Statement schema correctly', () => {
      const schemaStore = getSchemaStore();
      const schema = schemaStore.getSchema('Bank Statement');
      expect(schema).toBeDefined();
      expect(schema?.shape.starting_balance).toBeDefined();
    });

    it('should detect starting_balance as a number schema', () => {
      const schemaStore = getSchemaStore();
      const schema = schemaStore.getSchema('Bank Statement');
      const fieldSchema = schema?.shape.starting_balance;
      expect((fieldSchema as any)?._def?.typeName).toBe('ZodNumber');
    });
  });

  describe('coerceToNumber', () => {
    it('should handle malformed number strings with multiple periods (irregular format)', () => {
      // Test case from the issue: "5.3620.787" should become 53620.787
      // (treating the last period as decimal, removing others as malformed thousands separators)
      const result = (service as any).coerceToNumber('5.3620.787');
      expect(result).toBe(53620.787);
    });

    it('should handle regular decimal numbers', () => {
      expect((service as any).coerceToNumber('1234.56')).toBe(1234.56);
      expect((service as any).coerceToNumber('0.99')).toBe(0.99);
    });

    it('should handle US formatted numbers with commas', () => {
      expect((service as any).coerceToNumber('1,234.56')).toBe(1234.56);
      expect((service as any).coerceToNumber('1,234,567.89')).toBe(1234567.89);
    });

    it('should handle European formatted numbers (comma as decimal)', () => {
      expect((service as any).coerceToNumber('1234,56')).toBe(1234.56);
      expect((service as any).coerceToNumber('1.234,56')).toBe(1234.56);
    });

    it('should handle currency symbols', () => {
      expect((service as any).coerceToNumber('$1,234.56')).toBe(1234.56);
      expect((service as any).coerceToNumber('€1.234,56')).toBe(1234.56);
    });

    it('should handle negative numbers', () => {
      expect((service as any).coerceToNumber('-1234.56')).toBe(-1234.56);
      expect((service as any).coerceToNumber('($1,234.56)')).toBe(-1234.56);
    });

    it('should return null for invalid strings', () => {
      expect((service as any).coerceToNumber('abc')).toBe(null);
      expect((service as any).coerceToNumber('')).toBe(null);
    });

    it('should return numbers as-is', () => {
      expect((service as any).coerceToNumber(1234.56)).toBe(1234.56);
    });
  });

  describe('coerceFieldValue for Bank Statement', () => {
    it('should coerce a single starting_balance field value', () => {
      const result = service.coerceFieldValue('Bank Statement', 'starting_balance', '5.3620.787');
      expect(result).toBe(53620.787);
    });

    it('should coerce starting_balance and ending_balance strings to numbers', () => {
      const extractedData = {
        starting_balance: '5.3620.787',
        ending_balance: '6,789.12',
        account_holder_name: 'John Doe',
      };

      const coerced = service.coerceAllFields('Bank Statement', extractedData);

      expect(coerced.starting_balance).toBe(53620.787);
      expect(coerced.ending_balance).toBe(6789.12);
      expect(coerced.account_holder_name).toBe('John Doe');
    });

    it('should keep properly typed numbers unchanged', () => {
      const extractedData = {
        starting_balance: 5620.787,
        ending_balance: 6789.12,
      };

      const coerced = service.coerceAllFields('Bank Statement', extractedData);

      expect(coerced.starting_balance).toBe(5620.787);
      expect(coerced.ending_balance).toBe(6789.12);
    });
  });

  describe('coerceToBoolean', () => {
    it('should handle boolean values', () => {
      expect((service as any).coerceToBoolean(true)).toBe(true);
      expect((service as any).coerceToBoolean(false)).toBe(false);
    });

    it('should handle string representations', () => {
      expect((service as any).coerceToBoolean('true')).toBe(true);
      expect((service as any).coerceToBoolean('false')).toBe(false);
      expect((service as any).coerceToBoolean('yes')).toBe(true);
      expect((service as any).coerceToBoolean('no')).toBe(false);
      expect((service as any).coerceToBoolean('1')).toBe(true);
      expect((service as any).coerceToBoolean('0')).toBe(false);
    });

    it('should handle numbers', () => {
      expect((service as any).coerceToBoolean(1)).toBe(true);
      expect((service as any).coerceToBoolean(0)).toBe(false);
    });
  });

  describe('coerceToArray', () => {
    it('should handle arrays as-is', () => {
      const arr = ['one', 'two', 'three'];
      expect((service as any).coerceToArray(arr)).toEqual(arr);
    });

    it('should split comma-separated strings', () => {
      expect((service as any).coerceToArray('one, two, three')).toEqual([
        'one',
        'two',
        'three',
      ]);
    });

    it('should handle JSON arrays', () => {
      expect((service as any).coerceToArray('["one", "two", "three"]')).toEqual([
        'one',
        'two',
        'three',
      ]);
    });
  });
});
