# Changelog

All notable changes to Zombie Universe Toolkit will be documented in this file.

## [0.3.0] - 2026-04-26

### Added

- Added public documentation for module usage and release notes.
- Added GM authority infrastructure for privileged module operations.
- Added cleanup of deleted actors from group member lists.
- Added group expansion when dropping a group actor onto a group member list.
  Eligible TWDU character and NPC members are added while duplicates are skipped.
- Added vehicle owner drag support:
  - TWDU character/NPC owners can be dragged to driver or passengers,
  - group owners can be dragged to passengers and expand into eligible members,
  - group owners remain blocked from becoming drivers.
- Added stricter TWDU vehicle socket action validation.

### Changed

- Removed the party actor type. Group now covers the supported member-list and
  tactical aggregation use case for 0.3.0.
- Refactored TWDU vehicle integration so generic GM authority/socket handling is
  separated from TWDU vehicle domain behavior.
- Improved TWDU vehicle driver item synchronization:
  - current driver receives a linked TWDU vehicle item,
  - previous driver loses stale linked items,
  - deleting the current driver's linked item clears the vehicle driver,
  - deleting a vehicle cleans up linked driver items.
- Kept GM authority operations under the hood, without GM confirmation prompts.
- Clarified that TWDU vehicle driver items are a gameplay projection for TWDU
  Mobility mechanics.
- Made actor deletion cleanup more consistent across group and vehicle
  actor relationships.
- Improved vehicle driver reassignment. Dropping a new driver onto an occupied
  driver slot now moves the previous driver to passengers when capacity allows.

### Fixed

- Fixed nested actor-sheet form markup that could trigger a Foundry refresh and
  broken layout when confirming edited fields with Enter.
- Fixed Enter key handling for autosaved sheet fields so editing closes cleanly.
- Fixed group member drop-zone sizing so the drop area and internal scroll match
  the visible members panel.
- Fixed Skill Source reset behavior on group sheets when disabling the setting.

### Security

- Added sender/ownership validation for GM authority socket actions.
- Restricted deleted actor and deleted vehicle cleanup to GM authority.
- Used Foundry-provided socket sender identity where available instead of
  trusting only payload data.

### Maintenance

- Prepared the module for a cleaner release-candidate validation process.

## [0.2.0] - Previous release

### Notes

- Baseline release before the public changelog was introduced.
