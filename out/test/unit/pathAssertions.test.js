"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const pathAssertions_1 = require("../pathAssertions");
describe('test path assertions', () => {
    it('normalizes Windows drive-letter case without changing the rest of the path', () => {
        const upperDrive = (0, pathAssertions_1.normalizePathForComparison)('C:\\Users\\Runner\\project', 'win32');
        const lowerDrive = (0, pathAssertions_1.normalizePathForComparison)('c:\\Users\\Runner\\project', 'win32');
        assert.strictEqual(upperDrive, lowerDrive);
        assert.strictEqual(upperDrive, 'c:\\Users\\Runner\\project');
        assert.notStrictEqual((0, pathAssertions_1.normalizePathForComparison)('C:\\Users\\Runner\\project', 'win32'), (0, pathAssertions_1.normalizePathForComparison)('c:\\users\\Runner\\project', 'win32'));
    });
    it('keeps POSIX path comparison case-sensitive', () => {
        assert.notStrictEqual((0, pathAssertions_1.normalizePathForComparison)('/tmp/Model', 'darwin'), (0, pathAssertions_1.normalizePathForComparison)('/tmp/model', 'darwin'));
    });
});
//# sourceMappingURL=pathAssertions.test.js.map