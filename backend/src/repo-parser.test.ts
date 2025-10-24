import { describe, it, expect } from 'vitest';
import { 
  parseJjLog, 
  type Commit, 
  createCommitId,
  createEmail, 
  createDescription,
  parseTimestamp 
} from './repo-parser.js';

describe('branded type transforms', () => {
  describe('createCommitId', () => {
    it('should create valid commit ID', () => {
      const id = createCommitId('2a758693f101d14b8f9f0fa618122d0b6c17ff37');
      expect(id).toBe('2a758693f101d14b8f9f0fa618122d0b6c17ff37');
    });

    it('should trim whitespace', () => {
      const id = createCommitId('  2a758693f101d14b8f9f0fa618122d0b6c17ff37  ');
      expect(id).toBe('2a758693f101d14b8f9f0fa618122d0b6c17ff37');
    });

    it('should throw on invalid length', () => {
      expect(() => createCommitId('short')).toThrow('Invalid commit ID');
    });

    it('should throw on empty string', () => {
      expect(() => createCommitId('')).toThrow('Empty commit ID');
    });
  });
  describe('createEmail', () => {
    it('should create valid email', () => {
      const email = createEmail('user@example.com');
      expect(email).toBe('user@example.com');
    });

    it('should trim whitespace', () => {
      const email = createEmail('  user@example.com  ');
      expect(email).toBe('user@example.com');
    });

    it('should throw on invalid email', () => {
      expect(() => createEmail('invalid-email')).toThrow('Invalid email');
    });

    it('should throw on empty string', () => {
      expect(() => createEmail('')).toThrow('Invalid email');
    });
  });

  describe('createDescription', () => {
    it('should create valid description', () => {
      const desc = createDescription('Test commit');
      expect(desc).toBe('Test commit');
    });

    it('should trim whitespace', () => {
      const desc = createDescription('  Test commit  ');
      expect(desc).toBe('Test commit');
    });

    it('should return default for empty string', () => {
      const desc = createDescription('');
      expect(desc).toBe('(no description)');
    });

    it('should return default for whitespace-only string', () => {
      const desc = createDescription('   ');
      expect(desc).toBe('(no description)');
    });
  });

  describe('parseTimestamp', () => {
    it('should parse valid ISO timestamp', () => {
      const date = parseTimestamp('2025-10-13 21:31:04.000 +00:00');
      expect(date).toEqual(new Date('2025-10-13 21:31:04.000 +00:00'));
    });

    it('should trim whitespace', () => {
      const date = parseTimestamp('  2025-10-13 21:31:04.000 +00:00  ');
      expect(date).toEqual(new Date('2025-10-13 21:31:04.000 +00:00'));
    });

    it('should throw on invalid timestamp', () => {
      expect(() => parseTimestamp('invalid-date')).toThrow('Unable to parse timestamp');
    });

    it('should throw on empty string', () => {
      expect(() => parseTimestamp('')).toThrow('Invalid timestamp');
    });
  });
});

describe('parseJjLog', () => {
  it('should parse single commit correctly', () => {
    const logOutput = '2a758693f101d14b8f9f0fa618122d0b6c17ff37|abc123def456|Start experimenting with functionality|Tjörvi Jóhannsson|tjorvi@gmail.com|2025-10-13 21:31:04.000 +00:00|8d9cdd8d29c1c8df05c49db21a7dc5dcb6898f12|false';
    
    const commits = parseJjLog(logOutput);
    
    expect(commits).toHaveLength(1);
    expect(commits[0].id).toBe('2a758693f101d14b8f9f0fa618122d0b6c17ff37');
    expect(commits[0].changeId).toBe('abc123def456');
    expect(commits[0].description).toBe('Start experimenting with functionality');
    expect(commits[0].author.name).toBe('Tjörvi Jóhannsson');
    expect(commits[0].author.email).toBe('tjorvi@gmail.com');
    expect(commits[0].timestamp).toEqual(new Date('2025-10-13 21:31:04.000 +00:00'));
    expect(commits[0].parents).toHaveLength(1);
    expect(commits[0].parents[0]).toBe('8d9cdd8d29c1c8df05c49db21a7dc5dcb6898f12');
    expect(commits[0].hasConflicts).toBe(false);
  });

  it('should parse multiple commits correctly', () => {
    const logOutput = `2a758693f101d14b8f9f0fa618122d0b6c17ff37|abc123def456|Start experimenting with functionality|Tjörvi Jóhannsson|tjorvi@gmail.com|2025-10-13 21:31:04.000 +00:00|8d9cdd8d29c1c8df05c49db21a7dc5dcb6898f12|false
8d9cdd8d29c1c8df05c49db21a7dc5dcb6898f12|def456abc123|Bootstrapping frontend and backend|Tjörvi Jóhannsson|tjorvi@gmail.com|2025-10-13 21:05:42.000 +00:00|0000000000000000000000000000000000000000|false`;
    
    const commits = parseJjLog(logOutput);
    
    expect(commits).toHaveLength(2);
    expect(commits[0].id).toBe('2a758693f101d14b8f9f0fa618122d0b6c17ff37');
    expect(commits[1].id).toBe('8d9cdd8d29c1c8df05c49db21a7dc5dcb6898f12');
    expect(commits[0].hasConflicts).toBe(false);
    expect(commits[1].hasConflicts).toBe(false);
  });

  it('should handle commit with no parents', () => {
    const logOutput = '8d9cdd8d29c1c8df05c49db21a7dc5dcb6898f12|ghi789jkl012|Initial commit|Author|author@example.com|2025-10-13 21:05:42.000 +00:00||false';
    
    const commits = parseJjLog(logOutput);
    
    expect(commits).toHaveLength(1);
    expect(commits[0].parents).toEqual([]);
    expect(commits[0].hasConflicts).toBe(false);
  });

  it('should handle commit with multiple parents (merge)', () => {
    const logOutput = '1234567890123456789012345678901234567890|mno345pqr678|Merge commit|Author|author@example.com|2025-10-13 21:05:42.000 +00:00|1111111111111111111111111111111111111111,2222222222222222222222222222222222222222|false';
    
    const commits = parseJjLog(logOutput);
    
    expect(commits).toHaveLength(1);
    expect(commits[0].parents).toHaveLength(2);
    expect(commits[0].parents[0]).toBe('1111111111111111111111111111111111111111');
    expect(commits[0].parents[1]).toBe('2222222222222222222222222222222222222222');
    expect(commits[0].hasConflicts).toBe(false);
  });

  it('should skip root commit (all zeros)', () => {
    const logOutput = `2a758693f101d14b8f9f0fa618122d0b6c17ff37|abc123def456|Start experimenting|Author|author@example.com|2025-10-13 21:31:04.000 +00:00|8d9cdd8d29c1c8df05c49db21a7dc5dcb6898f12|false
0000000000000000000000000000000000000000|rootchangeid||||1970-01-01 00:00:00.000 +00:00|false`;
    
    const commits = parseJjLog(logOutput);
    
    expect(commits).toHaveLength(1);
    expect(commits[0].id).toBe('2a758693f101d14b8f9f0fa618122d0b6c17ff37');
    expect(commits[0].hasConflicts).toBe(false);
  });

  it('should throw on empty lines in log output', () => {
    const logOutput = `2a758693f101d14b8f9f0fa618122d0b6c17ff37|abc123def456|Start experimenting|Author|author@example.com|2025-10-13 21:31:04.000 +00:00|1234567890123456789012345678901234567890|false

malformed|line
8d9cdd8d29c1c8df05c49db21a7dc5dcb6898f12|def456abc123|Valid commit|Author|author@example.com|2025-10-13 21:05:42.000 +00:00|`;
    
    expect(() => parseJjLog(logOutput)).toThrow('Empty line at index 1');
  });

  it('should trim whitespace from all fields', () => {
    const logOutput = '  2a758693f101d14b8f9f0fa618122d0b6c17ff37  |  abc123def456  |  Start experimenting  |  Author  |  author@example.com  |  2025-10-13 21:31:04.000 +00:00  |  1234567890123456789012345678901234567890  |  false  ';
    
    const commits = parseJjLog(logOutput);
    
    expect(commits).toHaveLength(1);
    expect(commits[0].id).toBe('2a758693f101d14b8f9f0fa618122d0b6c17ff37');
    expect(commits[0].description).toBe('Start experimenting');
    expect(commits[0].author.name).toBe('Author');
    expect(commits[0].author.email).toBe('author@example.com');
    expect(commits[0].timestamp).toEqual(new Date('2025-10-13 21:31:04.000 +00:00'));
    expect(commits[0].parents).toHaveLength(1);
    expect(commits[0].parents[0]).toBe('1234567890123456789012345678901234567890');
    expect(commits[0].hasConflicts).toBe(false);
  });

  it('should throw on invalid commit IDs', () => {
    const logOutput = 'invalid-id|abc123def456|Description|Author|author@example.com|2025-10-13 21:31:04.000 +00:00||false';
    
    expect(() => parseJjLog(logOutput)).toThrow('Invalid commit ID');
  });

  it('should throw on invalid emails', () => {
    const logOutput = '2a758693f101d14b8f9f0fa618122d0b6c17ff37|abc123def456|Description|Author|invalid-email|2025-10-13 21:31:04.000 +00:00||false';
    
    expect(() => parseJjLog(logOutput)).toThrow('Invalid email');
  });

  it('should throw on invalid timestamps', () => {
    const logOutput = '2a758693f101d14b8f9f0fa618122d0b6c17ff37|abc123def456|Description|Author|author@example.com|invalid-timestamp||false';
    
    expect(() => parseJjLog(logOutput)).toThrow('Unable to parse timestamp');
  });

  it('should handle empty descriptions', () => {
    const logOutput = '28571ac8a11052def1977fcce769181cd2ba16b7|abc123def456||Tjörvi Jóhannsson|tjorvi@gmail.com|2025-10-13 21:55:24.264 +00:00|9c458eafe2fafd597d62cac332e0f03a0ab0bb2c|false';
    
    const commits = parseJjLog(logOutput);
    
    expect(commits).toHaveLength(1);
    expect(commits[0].id).toBe('28571ac8a11052def1977fcce769181cd2ba16b7');
    expect(commits[0].description).toBe('(no description)');
    expect(commits[0].author.name).toBe('Tjörvi Jóhannsson');
    expect(commits[0].author.email).toBe('tjorvi@gmail.com');
    expect(commits[0].hasConflicts).toBe(false);
  });

  it('should handle conflicts', () => {
    const logOutput = `f94ed763b474b527f9ad9d70e1441363b44d9620|mwnzumlxszomwqnzspmymkpuxuxzlvyz||Tjörvi Jóhannsson|tjorvi@gmail.com|2025-10-19 13:20:30.000 +00:00|4c7427359c6de7e4050aa2976c548df065ffed02|false
4c7427359c6de7e4050aa2976c548df065ffed02|ollwmrnqpxlvxwtwktpnrtprwmlwlxvz|Edited a|Tjörvi Jóhannsson|tjorvi@gmail.com|2025-10-18 22:25:56.000 +00:00|a21095ad158966506cdee8325ba342b6435ce006|false
a21095ad158966506cdee8325ba342b6435ce006|mwzqtqnwqyyxwtoqwoslqvlxukvqqmmt|Added b|Tjörvi Jóhannsson|tjorvi@gmail.com|2025-10-18 22:25:20.000 +00:00|756b7297726a83c82555f194c597544bda0585eb|false
756b7297726a83c82555f194c597544bda0585eb|onmsvlypqpxsoppqrlvsktqpouwlttnt|Added a|Tjörvi Jóhannsson|tjorvi@gmail.com|2025-10-18 22:25:13.000 +00:00|615cf582d8e9a1912347129302aafc00fdfc16c4|true
615cf582d8e9a1912347129302aafc00fdfc16c4|xrwzsxqlwusumoqnykvmxvlryyxmrxmw|Edited a|Tjörvi Jóhannsson|tjorvi@gmail.com|2025-10-18 22:25:56.000 +00:00|0000000000000000000000000000000000000000|true
0000000000000000000000000000000000000000|zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz||||1970-01-01 00:00:00.000 +00:00|false
`;

    const commits = parseJjLog(logOutput);

    expect(commits).toHaveLength(5);
    expect(commits.map(commit => commit.id)).toEqual([
      'f94ed763b474b527f9ad9d70e1441363b44d9620',
      '4c7427359c6de7e4050aa2976c548df065ffed02',
      'a21095ad158966506cdee8325ba342b6435ce006',
      '756b7297726a83c82555f194c597544bda0585eb',
      '615cf582d8e9a1912347129302aafc00fdfc16c4',
    ]);

    expect(commits[0]).toMatchObject({
      changeId: 'mwnzumlxszomwqnzspmymkpuxuxzlvyz',
      description: '(no description)',
      parents: ['4c7427359c6de7e4050aa2976c548df065ffed02'],
      hasConflicts: false,
    });
    expect(commits[0].timestamp).toEqual(new Date('2025-10-19 13:20:30.000 +00:00'));

    expect(commits[1]).toMatchObject({
      changeId: 'ollwmrnqpxlvxwtwktpnrtprwmlwlxvz',
      description: 'Edited a',
      parents: ['a21095ad158966506cdee8325ba342b6435ce006'],
      hasConflicts: false,
    });

    expect(commits[3]).toMatchObject({
      changeId: 'onmsvlypqpxsoppqrlvsktqpouwlttnt',
      hasConflicts: true,
    });

    expect(commits[4]).toMatchObject({
      changeId: 'xrwzsxqlwusumoqnykvmxvlryyxmrxmw',
      description: 'Edited a',
      parents: ['0000000000000000000000000000000000000000'],
      hasConflicts: true,
    });
    expect(commits[4].timestamp).toEqual(new Date('2025-10-18 22:25:56.000 +00:00'));
  });

});
