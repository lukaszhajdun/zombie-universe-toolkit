import { logger } from "../core/logger.js";
import {
  cleanupTwduLinksForDeletedVehicle,
  isTwduSystemActive
} from "../services/twdu-vehicle-integration.service.js";
import {
  cleanupVehicleRoleReferencesForDeletedActor,
  isVehicleActorDocument
} from "../services/vehicle-actor.service.js";

export function registerVehicleCleanupHooks() {
  Hooks.on("deleteActor", actor => {
    void cleanupVehicleRoleReferencesForDeletedActor(actor)
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

    void cleanupTwduLinksForDeletedVehicle(actor)
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
