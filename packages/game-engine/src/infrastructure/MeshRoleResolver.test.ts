import { describe, expect, test } from 'bun:test';
import { MeshRoleResolver, normalizeMeshName } from './MeshRoleResolver';

describe('normalizeMeshName', () => {
  test('minuscule + séparateurs → underscore', () => {
    expect(normalizeMeshName('Floor.Main')).toBe('floor_main');
    expect(normalizeMeshName('flipper-left')).toBe('flipper_left');
    expect(normalizeMeshName('Sensor Rocket')).toBe('sensor_rocket');
  });
});

describe('MeshRoleResolver.resolve', () => {
  const r = new MeshRoleResolver();

  test('préfixes → rôle + id', () => {
    expect(r.resolve('floor_main')).toEqual({ role: 'floor', id: 'main' });
    expect(r.resolve('wall_sides')).toEqual({ role: 'wall', id: 'sides' });
    expect(r.resolve('flipper_left')).toEqual({ role: 'flipper', id: 'left' });
    expect(r.resolve('bumper_1')).toEqual({ role: 'bumper', id: '1' });
    expect(r.resolve('slingshot_right')).toEqual({ role: 'slingshot', id: 'right' });
    expect(r.resolve('target_left_1')).toEqual({ role: 'target', id: 'left_1' });
    expect(r.resolve('sensor_rocket')).toEqual({ role: 'sensor', id: 'rocket' });
    expect(r.resolve('lane_floor')).toEqual({ role: 'lane', id: 'floor' });
    expect(r.resolve('vis_cassette')).toEqual({ role: 'vis', id: 'cassette' });
  });

  test('casing/séparateurs indifférents', () => {
    expect(r.resolve('Bumper-2')).toEqual({ role: 'bumper', id: '2' });
    expect(r.resolve('Floor.Main')).toEqual({ role: 'floor', id: 'main' });
  });

  test('mesh sans rôle → null + agrégé', () => {
    const x = new MeshRoleResolver();
    expect(x.resolve('Mesh_0')).toBeNull();
    expect(x.resolve('Circle.018')).toBeNull();
    expect(x.getUnresolved()).toEqual(['Mesh_0', 'Circle.018']);
  });
});

describe('MeshRoleResolver.resolveFromAncestry', () => {
  test('hérite du préfixe du parent (groupe)', () => {
    const r = new MeshRoleResolver();
    // Mesh_8 (primitive) sans rôle, mais son parent Circle.018 → wall_rail_left.
    expect(r.resolveFromAncestry(['Mesh_8', 'wall_rail_left'])).toEqual({
      role: 'wall',
      id: 'rail_left',
    });
  });

  test('le plus spécifique gagne (enfant surcharge le groupe)', () => {
    const r = new MeshRoleResolver();
    expect(r.resolveFromAncestry(['target_left_1', 'vis_decor_group'])).toEqual({
      role: 'target',
      id: 'left_1',
    });
  });

  test('vis_ sur un enfant exclut un détail dans un groupe physique', () => {
    const r = new MeshRoleResolver();
    // Vis décorative dans un groupe bumper_1 → non-physique (vis gagne).
    expect(r.resolveFromAncestry(['vis_screw', 'bumper_1'])).toEqual({
      role: 'vis',
      id: 'screw',
    });
    // Le reste du groupe (sans nom propre) hérite bien de bumper_1.
    expect(r.resolveFromAncestry(['Mesh_3', 'bumper_1'])).toEqual({
      role: 'bumper',
      id: '1',
    });
  });

  test('aucun ancêtre résolu → null + mesh enregistré', () => {
    const r = new MeshRoleResolver();
    expect(r.resolveFromAncestry(['Mesh_8', 'Circle.018', 'Pinballmap'])).toBeNull();
    expect(r.getUnresolved()).toEqual(['Mesh_8']);
  });
});

describe('MeshRoleResolver aliases', () => {
  test('alias appliqué avant le matching de préfixe', () => {
    const r = new MeshRoleResolver({
      'pop_bumper': 'bumper_1',
      'playfield': 'floor_main',
      'Mesh_1': 'wall_sides',
    });
    expect(r.resolve('pop_bumper')).toEqual({ role: 'bumper', id: '1' });
    expect(r.resolve('playfield')).toEqual({ role: 'floor', id: 'main' });
    expect(r.resolve('Mesh_1')).toEqual({ role: 'wall', id: 'sides' });
  });
});
