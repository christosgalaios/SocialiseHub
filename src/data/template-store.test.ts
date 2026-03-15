import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase, type Database } from './database.js';
import { TemplateStore } from './template-store.js';

describe('TemplateStore', () => {
  let db: Database;
  let store: TemplateStore;

  beforeEach(() => {
    db = createDatabase(':memory:');
    store = new TemplateStore(db);
  });

  afterEach(() => {
    db.close();
  });

  it('creates and retrieves a template', () => {
    const template = store.create({
      name: 'Weekly Social',
      title: 'Friday Social Drinks',
      description: 'Casual social evening',
      venue: 'The Lanes',
      durationMinutes: 180,
      price: 0,
      capacity: 50,
      platforms: ['meetup', 'eventbrite'],
    });
    expect(template.name).toBe('Weekly Social');
    expect(template.title).toBe('Friday Social Drinks');
    expect(template.platforms).toEqual(['meetup', 'eventbrite']);

    const retrieved = store.getById(template.id);
    expect(retrieved).toBeDefined();
    expect(retrieved!.name).toBe('Weekly Social');
  });

  it('lists all templates', () => {
    store.create({ name: 'A', title: 'A', description: '', venue: '', durationMinutes: 60, price: 0, capacity: 10, platforms: [] });
    store.create({ name: 'B', title: 'B', description: '', venue: '', durationMinutes: 60, price: 0, capacity: 10, platforms: [] });
    expect(store.getAll().length).toBe(2);
  });

  it('updates a template', () => {
    const template = store.create({ name: 'Old', title: 'Old Title', description: '', venue: '', durationMinutes: 60, price: 0, capacity: 10, platforms: [] });
    const updated = store.update(template.id, { name: 'New', title: 'New Title' });
    expect(updated!.name).toBe('New');
    expect(updated!.title).toBe('New Title');
  });

  it('deletes a template', () => {
    const template = store.create({ name: 'Del', title: 'Delete Me', description: '', venue: '', durationMinutes: 60, price: 0, capacity: 10, platforms: [] });
    expect(store.delete(template.id)).toBe(true);
    expect(store.getById(template.id)).toBeUndefined();
  });

  it('returns undefined for non-existent template', () => {
    expect(store.getById('non-existent')).toBeUndefined();
  });
});
