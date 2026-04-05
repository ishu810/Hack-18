import { Router } from 'express';
import {
  createTrip,
  generatePlaces,
  selectPlaces,
  optimizeRoutePreview,
  generateItinerary,

  computeRoute,
  getFlightCost,
  estimateBudget,
} from '../controllers/travel.controller.js';
import { verifyJWT } from '../middlewares/auth.middleware.js';

const router = Router();

router.use(verifyJWT);

router.post('/create', createTrip);
router.post('/optimize-preview', optimizeRoutePreview);
router.post('/route/compute', computeRoute);
router.post('/flight-cost', getFlightCost);
router.get('/:tripId/budget', estimateBudget);
router.post('/:tripId/budget', estimateBudget);
router.get('/:tripId/places', generatePlaces);
router.put('/:tripId/select', selectPlaces);
router.get('/:tripId/itinerary', generateItinerary);

export default router;