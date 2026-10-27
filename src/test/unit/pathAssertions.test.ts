import * as assert from 'assert';
import { normalizePathForComparison } from '../pathAssertions';

describe('test path assertions', () => {
    it('normalizes Windows drive-letter case without changing the rest of the path', () => {
        const upperDrive = normalizePathForComparison('C:\\Users\\Runner\\project', 'win32');
        const lowerDrive = normalizePathForComparison('c:\\Users\\Runner\\project', 'win32');

        assert.strictEqual(upperDrive, lowerDrive);
        assert.strictEqual(upperDrive, 'c:\\Users\\Runner\\project');
        assert.notStrictEqual(
            normalizePathForComparison('C:\\Users\\Runner\\project', 'win32'),
            normalizePathForComparison('c:\\users\\Runner\\project', 'win32'),
        );
    });

    it('keeps POSIX path comparison case-sensitive', () => {
        assert.notStrictEqual(
            normalizePathForComparison('/tmp/Model', 'darwin'),
            normalizePathForComparison('/tmp/model', 'darwin'),
        );
    });
});
