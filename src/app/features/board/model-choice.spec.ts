import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { Api } from '../../api/generated/api';
import { modelChoice } from './model-choice';

describe('the model choice', () => {
  it('is one choice for the whole page: picking in the chat picks in the summary too', async () => {
    const api = { invoke: () => Promise.resolve([{ id: 'm1', label: 'Claude', model: 'a' }, { id: 'm2', label: 'Other', model: 'b' }]) } as unknown as Api;
    const [chat, summary] = TestBed.runInInjectionContext(() => [modelChoice(api, () => 'org'), modelChoice(api, () => 'org')]);
    await TestBed.inject(ApplicationRef).whenStable();
    chat.choose('m1');
    expect(summary.modelId()).toBe('m1');
    chat.choose('m2');
    expect(summary.modelId()).toBe('m2');
    expect(summary.name()).toBe('Other');
  });
});
