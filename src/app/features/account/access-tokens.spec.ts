import { claudeCodeCommand, cursorConfig, mcpUrl, scopeWords } from './access-tokens';

describe('access tokens', () => {
  it('writes the MCP config to paste, for Claude Code and Cursor', () => {
    const url = mcpUrl('https://corkboard.example.com');
    expect(url).toBe('https://corkboard.example.com/api/mcp');
    expect(claudeCodeCommand(url, 'cbp_abc')).toBe(
      'claude mcp add --transport http corkboard https://corkboard.example.com/api/mcp --header "Authorization: Bearer cbp_abc"',
    );
    expect(JSON.parse(cursorConfig(url, 'cbp_abc'))).toEqual({
      mcpServers: { corkboard: { url, headers: { Authorization: 'Bearer cbp_abc' } } },
    });
  });

  it('says what a token may do, in the order the form offers', () => {
    expect(scopeWords(['comments:write', 'boards:read'])).toBe('Read boards, Comment');
  });
});
