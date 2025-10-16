import { describe, it, expect } from 'vitest';
import { 
  parseJjLog, 
  buildCommitGraph, 
  type Commit, 
  createCommitId,
  createChangeId, 
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
      expect(() => createCommitId('')).toThrow('Invalid commit ID');
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
    const logOutput = '2a758693f101d14b8f9f0fa618122d0b6c17ff37|Start experimenting with functionality|Tjörvi Jóhannsson|tjorvi@gmail.com|2025-10-13 21:31:04.000 +00:00|8d9cdd8d29c1c8df05c49db21a7dc5dcb6898f12';
    
    const commits = parseJjLog(logOutput);
    
    expect(commits).toHaveLength(1);
    expect(commits[0].id).toBe('2a758693f101d14b8f9f0fa618122d0b6c17ff37');
    expect(commits[0].description).toBe('Start experimenting with functionality');
    expect(commits[0].author.name).toBe('Tjörvi Jóhannsson');
    expect(commits[0].author.email).toBe('tjorvi@gmail.com');
    expect(commits[0].timestamp).toEqual(new Date('2025-10-13 21:31:04.000 +00:00'));
    expect(commits[0].parents).toHaveLength(1);
    expect(commits[0].parents[0]).toBe('8d9cdd8d29c1c8df05c49db21a7dc5dcb6898f12');
  });

  it('should parse multiple commits correctly', () => {
    const logOutput = `2a758693f101d14b8f9f0fa618122d0b6c17ff37|Start experimenting with functionality|Tjörvi Jóhannsson|tjorvi@gmail.com|2025-10-13 21:31:04.000 +00:00|8d9cdd8d29c1c8df05c49db21a7dc5dcb6898f12
8d9cdd8d29c1c8df05c49db21a7dc5dcb6898f12|Bootstrapping frontend and backend|Tjörvi Jóhannsson|tjorvi@gmail.com|2025-10-13 21:05:42.000 +00:00|0000000000000000000000000000000000000000`;
    
    const commits = parseJjLog(logOutput);
    
    expect(commits).toHaveLength(2);
    expect(commits[0].id).toBe('2a758693f101d14b8f9f0fa618122d0b6c17ff37');
    expect(commits[1].id).toBe('8d9cdd8d29c1c8df05c49db21a7dc5dcb6898f12');
  });

  it('should handle commit with no parents', () => {
    const logOutput = '8d9cdd8d29c1c8df05c49db21a7dc5dcb6898f12|Initial commit|Author|author@example.com|2025-10-13 21:05:42.000 +00:00|';
    
    const commits = parseJjLog(logOutput);
    
    expect(commits).toHaveLength(1);
    expect(commits[0].parents).toEqual([]);
  });

  it('should handle commit with multiple parents (merge)', () => {
    const logOutput = '1234567890123456789012345678901234567890|Merge commit|Author|author@example.com|2025-10-13 21:05:42.000 +00:00|1111111111111111111111111111111111111111,2222222222222222222222222222222222222222';
    
    const commits = parseJjLog(logOutput);
    
    expect(commits).toHaveLength(1);
    expect(commits[0].parents).toHaveLength(2);
    expect(commits[0].parents[0]).toBe('1111111111111111111111111111111111111111');
    expect(commits[0].parents[1]).toBe('2222222222222222222222222222222222222222');
  });

  it('should skip root commit (all zeros)', () => {
    const logOutput = `2a758693f101d14b8f9f0fa618122d0b6c17ff37|Start experimenting|Author|author@example.com|2025-10-13 21:31:04.000 +00:00|8d9cdd8d29c1c8df05c49db21a7dc5dcb6898f12
0000000000000000000000000000000000000000||||1970-01-01 00:00:00.000 +00:00|`;
    
    const commits = parseJjLog(logOutput);
    
    expect(commits).toHaveLength(1);
    expect(commits[0].id).toBe('2a758693f101d14b8f9f0fa618122d0b6c17ff37');
  });

  it('should handle empty lines and malformed lines', () => {
    const logOutput = `2a758693f101d14b8f9f0fa618122d0b6c17ff37|Start experimenting|Author|author@example.com|2025-10-13 21:31:04.000 +00:00|1234567890123456789012345678901234567890

malformed|line
8d9cdd8d29c1c8df05c49db21a7dc5dcb6898f12|Valid commit|Author|author@example.com|2025-10-13 21:05:42.000 +00:00|`;
    
    const commits = parseJjLog(logOutput);
    
    expect(commits).toHaveLength(2);
    expect(commits[0].id).toBe('2a758693f101d14b8f9f0fa618122d0b6c17ff37');
    expect(commits[1].id).toBe('8d9cdd8d29c1c8df05c49db21a7dc5dcb6898f12');
  });

  it('should trim whitespace from all fields', () => {
    const logOutput = '  2a758693f101d14b8f9f0fa618122d0b6c17ff37  |  Start experimenting  |  Author  |  author@example.com  |  2025-10-13 21:31:04.000 +00:00  |  1234567890123456789012345678901234567890  ';
    
    const commits = parseJjLog(logOutput);
    
    expect(commits).toHaveLength(1);
    expect(commits[0].id).toBe('2a758693f101d14b8f9f0fa618122d0b6c17ff37');
    expect(commits[0].description).toBe('Start experimenting');
    expect(commits[0].author.name).toBe('Author');
    expect(commits[0].author.email).toBe('author@example.com');
    expect(commits[0].timestamp).toEqual(new Date('2025-10-13 21:31:04.000 +00:00'));
    expect(commits[0].parents).toHaveLength(1);
    expect(commits[0].parents[0]).toBe('1234567890123456789012345678901234567890');
  });

  it('should throw on invalid commit IDs', () => {
    const logOutput = 'invalid-id|Description|Author|author@example.com|2025-10-13 21:31:04.000 +00:00|';
    
    expect(() => parseJjLog(logOutput)).toThrow('Invalid commit ID');
  });

  it('should throw on invalid emails', () => {
    const logOutput = '2a758693f101d14b8f9f0fa618122d0b6c17ff37|Description|Author|invalid-email|2025-10-13 21:31:04.000 +00:00|';
    
    expect(() => parseJjLog(logOutput)).toThrow('Invalid email');
  });

  it('should throw on invalid timestamps', () => {
    const logOutput = '2a758693f101d14b8f9f0fa618122d0b6c17ff37|Description|Author|author@example.com|invalid-timestamp|';
    
    expect(() => parseJjLog(logOutput)).toThrow('Unable to parse timestamp');
  });

  it('should handle empty descriptions', () => {
    const logOutput = '28571ac8a11052def1977fcce769181cd2ba16b7||Tjörvi Jóhannsson|tjorvi@gmail.com|2025-10-13 21:55:24.264 +00:00|9c458eafe2fafd597d62cac332e0f03a0ab0bb2c';
    
    const commits = parseJjLog(logOutput);
    
    expect(commits).toHaveLength(1);
    expect(commits[0].id).toBe('28571ac8a11052def1977fcce769181cd2ba16b7');
    expect(commits[0].description).toBe('(no description)');
    expect(commits[0].author.name).toBe('Tjörvi Jóhannsson');
    expect(commits[0].author.email).toBe('tjorvi@gmail.com');
  });
});

describe('buildCommitGraph', () => {
  const sampleCommits: Commit[] = [
    {
      id: createCommitId('1111111111111111111111111111111111111111'),
      changeId: createChangeId('change1'),
      description: createDescription('First commit'),
      author: { name: 'Author', email: createEmail('author@example.com') },
      timestamp: new Date('2025-10-13 21:00:00.000 +00:00'),
      parents: [],
    },
    {
      id: createCommitId('2222222222222222222222222222222222222222'),
      changeId: createChangeId('change2'),
      description: createDescription('Second commit'),
      author: { name: 'Author', email: createEmail('author@example.com') },
      timestamp: new Date('2025-10-13 21:01:00.000 +00:00'),
      parents: [createCommitId('1111111111111111111111111111111111111111')],
    },
    {
      id: createCommitId('3333333333333333333333333333333333333333'),
      changeId: createChangeId('change3'),
      description: createDescription('Third commit'),
      author: { name: 'Author', email: createEmail('author@example.com') },
      timestamp: new Date('2025-10-13 21:02:00.000 +00:00'),
      parents: [createCommitId('2222222222222222222222222222222222222222')],
    },
  ];

  it('should build correct parent-child relationships', () => {
    const graph = buildCommitGraph(sampleCommits);
    
    expect(Object.keys(graph).length).toBe(3);
    
    const commit1Id = createCommitId('1111111111111111111111111111111111111111');
    const commit2Id = createCommitId('2222222222222222222222222222222222222222');
    const commit3Id = createCommitId('3333333333333333333333333333333333333333');
    
    // commit1 should have commit2 as child
    expect(graph[commit1Id]?.children).toEqual([commit2Id]);
    
    // commit2 should have commit3 as child
    expect(graph[commit2Id]?.children).toEqual([commit3Id]);
    
    // commit3 should have no children
    expect(graph[commit3Id]?.children).toEqual([]);
  });

  it('should handle merge commits with multiple parents', () => {
    const mergeCommits: Commit[] = [
      {
        id: createCommitId('1111111111111111111111111111111111111111'),
        changeId: createChangeId('change1'),
        description: createDescription('First commit'),
        author: { name: 'Author', email: createEmail('author@example.com') },
        timestamp: new Date('2025-10-13 21:00:00.000 +00:00'),
        parents: [],
      },
      {
        id: createCommitId('2222222222222222222222222222222222222222'),
        changeId: createChangeId('change2'),
        description: createDescription('Second commit'),
        author: { name: 'Author', email: createEmail('author@example.com') },
        timestamp: new Date('2025-10-13 21:01:00.000 +00:00'),
        parents: [],
      },
      {
        id: createCommitId('3333333333333333333333333333333333333333'),
        changeId: createChangeId('change3'),
        description: createDescription('Merge commit'),
        author: { name: 'Author', email: createEmail('author@example.com') },
        timestamp: new Date('2025-10-13 21:02:00.000 +00:00'),
        parents: [
          createCommitId('1111111111111111111111111111111111111111'),
          createCommitId('2222222222222222222222222222222222222222')
        ],
      },
    ];

    const graph = buildCommitGraph(mergeCommits);
    
    const commit1Id = createCommitId('1111111111111111111111111111111111111111');
    const commit2Id = createCommitId('2222222222222222222222222222222222222222');
    const commit3Id = createCommitId('3333333333333333333333333333333333333333');
    
    // Both commit1 and commit2 should have merge1 as child
    expect(graph[commit1Id]?.children).toEqual([commit3Id]);
    expect(graph[commit2Id]?.children).toEqual([commit3Id]);
    expect(graph[commit3Id]?.children).toEqual([]);
  });

  it('should handle empty commit list', () => {
    const graph = buildCommitGraph([]);
    
    expect(Object.keys(graph).length).toBe(0);
  });

  it('should handle commits with non-existent parents', () => {
    const commitsWithMissingParent: Commit[] = [
      {
        id: createCommitId('1111111111111111111111111111111111111111'),
        changeId: createChangeId('change1'),
        description: createDescription('Commit with missing parent'),
        author: { name: 'Author', email: createEmail('author@example.com') },
        timestamp: new Date('2025-10-13 21:00:00.000 +00:00'),
        parents: [createCommitId('9999999999999999999999999999999999999999')],
      },
    ];

    const graph = buildCommitGraph(commitsWithMissingParent);
    
    expect(Object.keys(graph).length).toBe(1);
    const commitId = createCommitId('1111111111111111111111111111111111111111');
    expect(graph[commitId]?.children).toEqual([]);
    // Should not crash when parent doesn't exist
  });
});