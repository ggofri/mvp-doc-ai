import { Router } from 'express';
import { getMetricStore } from '../../services/metrics/MetricStore';

const router = Router();
const metricStore = getMetricStore();

router.get('/', async (req, res) => {
  try {
    const metrics = await metricStore.getMetrics();

    res.json(metrics);
  } catch (error) {
    console.error('Error fetching metrics:', error);
    res.status(500).json({
      error: 'Failed to fetch metrics',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.post('/refresh', async (req, res) => {
  try {
    const metrics = await metricStore.refreshMetrics();

    res.json({
      message: 'Metrics refreshed successfully',
      metrics,
    });
  } catch (error) {
    console.error('Error refreshing metrics:', error);
    res.status(500).json({
      error: 'Failed to refresh metrics',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.get('/cache-status', (req, res) => {
  const status = metricStore.getCacheStatus();
  res.json(status);
});

export default router;
