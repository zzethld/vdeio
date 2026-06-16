import { describe, it, expect } from 'vitest';
import { calculateDiff, type VideoDownload } from '../../../electron/sync-service';

describe('calculateDiff', () => {
  const serverVideos: VideoDownload[] = [
    { videoId: 1, title: 'Video 1', fileSize: 100, campaignId: 1, playlistUrl: 'http://v1' },
    { videoId: 2, title: 'Video 2', fileSize: 200, campaignId: 1, playlistUrl: 'http://v2' },
    { videoId: 3, title: 'Video 3', fileSize: 300, campaignId: 2, playlistUrl: 'http://v3' },
  ];

  it('returns all videos as downloads when local cache is empty', () => {
    const diff = calculateDiff([], serverVideos);
    expect(diff.downloads).toHaveLength(3);
    expect(diff.deletes).toHaveLength(0);
    expect(diff.downloads.map(d => d.videoId)).toEqual([1, 2, 3]);
  });

  it('returns all local videos as deletes when server playlist is empty', () => {
    const diff = calculateDiff([1, 2, 3], []);
    expect(diff.downloads).toHaveLength(0);
    expect(diff.deletes).toHaveLength(3);
    expect(diff.deletes.map(d => d.videoId)).toEqual([1, 2, 3]);
  });

  it('handles partial overlap correctly', () => {
    const diff = calculateDiff([1, 4], serverVideos);
    expect(diff.downloads).toHaveLength(2);
    expect(diff.downloads.map(d => d.videoId)).toEqual([2, 3]);
    expect(diff.deletes).toHaveLength(1);
    expect(diff.deletes[0].videoId).toBe(4);
  });

  it('returns empty diff when local and server are identical', () => {
    const diff = calculateDiff([1, 2, 3], serverVideos);
    expect(diff.downloads).toHaveLength(0);
    expect(diff.deletes).toHaveLength(0);
  });

  it('handles empty local and empty server', () => {
    const diff = calculateDiff([], []);
    expect(diff.downloads).toHaveLength(0);
    expect(diff.deletes).toHaveLength(0);
  });

  it('handles server videos with duplicate ids (takes first occurrence)', () => {
    const duplicates: VideoDownload[] = [
      ...serverVideos,
      { videoId: 1, title: 'Duplicate', fileSize: 999, campaignId: 1, playlistUrl: 'http://dup' },
    ];
    const diff = calculateDiff([], duplicates);
    expect(diff.downloads).toHaveLength(3);
    expect(diff.downloads[0].title).toBe('Video 1');
  });
});
