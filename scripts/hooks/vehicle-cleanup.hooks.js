import { logger } from "../core/logger.js";
import {
  cleanupActorMemberReferencesForDeletedActor
} from "../services/actor-members.service.js";
import {
  isTwduGmAuthority,
  isTwduSystemActive,
  requestCleanupTwduLinksForDeletedVehicle,
  requestCleanupVehicleRoleReferencesForDeletedActor
} from "../services/twdu-vehicle-integration.service.js";
import {
  isVehicleActorDocument
} from "../services/vehicle-actor.service.js";

export function registerVehicleCleanupHooks() {
  Hooks.on("deleteActor", actor => {
    if (!isTwduGmAuthority()) return;

    void cleanupActorMemberReferencesForDeletedActor(actor)
      .then(result => {
        if (result.status !== "cleaned") return;
        if (!result.updatedActors && !result.removedMembers) return;

        logger.debug("Cleaned group and party member references after actor deletion.", {
          deletedActorUuid: actor?.uuid ?? "",
          deletedActorName: actor?.name ?? "",
          result
        });
      })
      .catch(error => {
        logger.error("Failed to clean group and party member references after actor deletion.", error);
      });

    void requestCleanupVehicleRoleReferencesForDeletedActor(actor)
      .then(result => {
        if (result.status !== "cleaned") return;
        if (!result.updatedVehicles && !result.clearedOwner && !result.clearedDriver && !result.removedPassengers) return;

        logger.debug("Cleaned vehicle role references after actor deletion.", {
          deletedActorUuid: actor?.uuid ?? "",
          deletedActorName: actor?.name ?? "",
          result
        });
      })
      .catch(error => {
        logger.error("Failed to clean vehicle role references after actor deletion.", error);
      });

    if (!isTwduSystemActive()) return;
    if (!isVehicleActorDocument(actor)) return;

    void requestCleanupTwduLinksForDeletedVehicle(actor)
      .then(result => {
        if (result.status !== "cleaned") return;
        if (!result.removedClones) return;

        logger.debug("Cleaned TWDU linked driver vehicle clone items after vehicle deletion.", {
          deletedVehicleUuid: actor?.uuid ?? "",
          deletedVehicleName: actor?.name ?? "",
          result
        });
      })
      .catch(error => {
        logger.error("Failed to clean TWDU linked items after vehicle deletion.", error);
      });
  });
}
