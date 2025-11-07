import { dailyUrls } from '../../src/lib/urls';

describe('dailyUrls', () => {
  it('should generate URLs for a single day', () => {
    const start = new Date('2023-01-01');
    const end = new Date('2023-01-01');
    const urls = dailyUrls(start, end);
    expect(urls).toEqual(['https://coast.noaa.gov/htdata/CMSP/AISDataHandler/2023/AIS_2023_01_01.zip']);
  });

  it('should generate URLs for multiple days', () => {
    const start = new Date('2023-01-01');
    const end = new Date('2023-01-03');
    const urls = dailyUrls(start, end);
    expect(urls).toEqual([
      'https://coast.noaa.gov/htdata/CMSP/AISDataHandler/2023/AIS_2023_01_01.zip',
      'https://coast.noaa.gov/htdata/CMSP/AISDataHandler/2023/AIS_2023_01_02.zip',
      'https://coast.noaa.gov/htdata/CMSP/AISDataHandler/2023/AIS_2023_01_03.zip',
    ]);
  });

  it('should handle year transitions', () => {
    const start = new Date('2022-12-31');
    const end = new Date('2023-01-01');
    const urls = dailyUrls(start, end);
    expect(urls).toEqual([
      'https://coast.noaa.gov/htdata/CMSP/AISDataHandler/2022/AIS_2022_12_31.zip',
      'https://coast.noaa.gov/htdata/CMSP/AISDataHandler/2023/AIS_2023_01_01.zip',
    ]);
  });
});
