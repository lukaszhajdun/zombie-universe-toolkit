# Zombie Universe Toolkit

Zombie Universe Toolkit is a Foundry VTT module for The Walking Dead Universe
RPG. It adds focused world-entity actor sheets and TWDU-aware tools for managing
groups, vehicles, factions, storage, and vehicle driver item
integration.

The module is currently designed and tested for Foundry VTT 13 and the `twdu`
system.

## Features

- Module actor types for:
  - groups,
  - vehicles,
  - factions.
- Custom actor sheets with edit locking and ownership-aware controls.
- Group member management with TWDU tactical roll support.
- Vehicle role management:
  - owner,
  - driver,
  - passengers,
  - passenger capacity checks,
  - duplicate role prevention.
- TWDU vehicle item integration:
  - import TWDU vehicle items into module vehicle actors,
  - keep a linked source vehicle item on the module vehicle,
  - give the current driver a linked TWDU vehicle item clone,
  - remove stale driver clone items,
  - clear the vehicle driver when the current driver deletes the clone item,
  - sync supported vehicle fields between linked TWDU items and module vehicle
    actors.
- Storage windows for supported actor storage slots.
- Item movement into and out of storage.
- Cleanup after deleted actors and vehicles.
- English and Polish localization.

## Requirements

- Foundry VTT 13.
- The Walking Dead Universe RPG system (`twdu`).

The module is increasingly TWDU-focused. Some actor-management features are
generic in shape, but the recommended and supported use case is TWDU.

## Installation

Install the module using this manifest URL:

```text
https://raw.githubusercontent.com/lukaszhajdun/zombie-universe-toolkit/main/module.json
```

Then enable **Zombie Universe Toolkit** in your TWDU world.

## Quick Start

1. Enable the module in a TWDU world.
2. Create one of the module actor types:
   - `group`,
   - `vehicle`,
   - `faction`.
3. Open the actor sheet and configure the actor.
4. For group actors, drag TWDU character or NPC actors into the member list.
5. For vehicle actors, assign owner, driver, and passengers from the vehicle
   sheet.
6. To integrate a TWDU vehicle item, import or drop a TWDU item of type
   `vehicle` into a module vehicle actor.

## TWDU Vehicle Driver Items

TWDU vehicle items can provide bonuses to Mobility rolls. To support that
mechanic, the module creates a linked vehicle item on the actor assigned as the
driver.

Important behavior:

- Assigning a driver gives that driver a linked TWDU vehicle item.
- Changing the driver removes the linked item from the previous driver and adds
  it to the new driver.
- Removing the driver removes the linked item.
- If the current driver deletes that linked item from their actor sheet, the
  module treats it as the driver resigning from the vehicle and clears the
  driver role on the vehicle actor.
- If the vehicle actor is deleted, linked driver items for that vehicle are
  cleaned up.

This is intentional gameplay behavior, not just data synchronization.

## Permissions and Ownership

Foundry ownership controls who can edit module actors.

- Players with owner permission can edit assigned module actors.
- Players without owner permission should not be able to edit those actors.
- The module's edit lock can further prevent editing even for owners.
- Storage access and storage item movement respect actor ownership and lock
  state.
- Some TWDU synchronization work is executed by the active GM client under the
  hood. Players do not need a GM confirmation dialog for legitimate actions.

## Storage

Storage uses embedded item movement and module flags to mark items as stored in
specific storage slots. This approach is a deliberate compatibility compromise
with Foundry and TWDU item behavior.

Storage rules:

- The storage host actor must be owned by the user.
- The storage slot must be enabled.
- The host actor must not be edit-locked.
- Moving a storage item to another actor requires ownership of the target actor.

## Cleanup Behavior

The module performs cleanup for common world maintenance cases:

- Deleted actors are removed from group member lists.
- Deleted actors are cleared from vehicle owner, driver, and passenger roles.
- Deleted vehicle actors cause linked driver clone items to be removed from
  other actors.
- Deleting a current driver's linked vehicle item clears the vehicle driver.

## Recommended Use

This module is currently recommended for solo and small-group TWDU play. It has
been designed so solo play, where the player is also the GM, does not require
extra confirmation steps.

Multiplayer support exists for ownership-aware workflows, but manual testing in
your own world is recommended before using it in a larger campaign.

## Development Notes

The current release candidate is planned as `0.3.0`.

Before creating a GitHub release:

1. Complete the manual Foundry test checklist.
2. Update `module.json` version.
3. Commit the version bump.
4. Tag the commit as `vX.Y.Z`.
5. Push the branch and tag.

The release workflow validates that the tag version matches `module.json`.

## License

See the repository license, if one is provided.
