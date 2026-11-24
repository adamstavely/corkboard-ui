import { isTerms, logoFromSvg, logoName } from './svg-files';

describe('logos from a vendor download', () => {
  it('reads an SVG file as a viewBox and its drawing, its class colours made each element’s own', () => {
    const svg = `<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
      <title>Amazon S3</title><style>.cls-1{fill:#3f8624;}</style>
      <!-- exported --><g><path class="cls-1" d="M0 0h64v64H0z"/></g></svg>`;
    const logo = logoFromSvg(svg)!;
    expect(logo.vb).toBe('0 0 64 64');
    expect(logo.body).toBe('<g><path class="cls-1" d="M0 0h64v64H0z" style="fill:#3f8624;"/></g>');
    expect(logoFromSvg('<svg viewBox="0 0 10 10"><rect width="10" height="10"/></svg>')).toEqual({ vb: '0 0 10 10', body: '<rect width="10" height="10"/>' });
    expect(logoFromSvg('not svg at all')).toBeNull();
    expect(logoFromSvg('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>')).toBeNull();
  });

  it('names logos after their files and spots the terms', () => {
    expect(logoName('Arch_Amazon-S3_64.svg')).toBe('arch-amazon-s3-64');
    expect(logoName('10021-icon-service-Virtual-Machine.svg')).toBe('10021-icon-service-virtual-machine');
    expect(isTerms('LICENSE.txt')).toBe(true);
    expect(isTerms('Terms of use.md')).toBe(true);
    expect(isTerms('s3.svg')).toBe(false);
  });
});
