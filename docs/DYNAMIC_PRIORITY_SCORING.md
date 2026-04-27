# Dynamic Priority Scoring Algorithm

This document describes the implementation of the dynamic priority scoring algorithm for waitlist entries, which calculates priority scores based on multiple factors including user engagement, referral activity, social network influence, and manual boosts.

## Overview

The Dynamic Priority Scoring system provides a flexible, configurable algorithm that combines multiple data points to generate comprehensive priority scores. The system supports real-time score recalculation, transparent scoring explanations, and admin-configurable scoring factors.

## Key Components

### 1. Dynamic Priority Scoring Service (`DynamicPriorityScoringService`)

Core service responsible for calculating and managing priority scores.

#### Features:
- **Multi-factor Scoring**: Combines behavioral, social, engagement, temporal, and manual factors
- **Configurable Weights**: Admin-adjustable scoring parameters
- **Real-time Updates**: Automatic score recalculation on data changes
- **Transparent Scoring**: Detailed explanations for score calculations
- **Performance Optimized**: Efficient calculations for large waitlists
- **Trend Analysis**: Historical score tracking and trend identification

#### Key Methods:
- `calculatePriorityScore()`: Calculates score for individual user
- `batchCalculateScores()`: Processes entire waitlist efficiently
- `updateScoringConfiguration()`: Modifies scoring parameters
- `getScoreTrend()`: Analyzes score changes over time
- `getScoringAnalytics()`: Provides comprehensive analytics

### 2. Scoring Configuration

Flexible configuration system for scoring algorithm behavior.

#### Configuration Elements:
- **Factors**: Individual scoring components with weights and settings
- **Normalization Method**: Score standardization approach
- **Outlier Handling**: Treatment of extreme values
- **Score Range**: Target output range
- **Update Tracking**: Configuration change audit trail

### 3. Scoring Factors

Predefined factors that contribute to priority scores:

#### Behavioral Factors
- **Activity Frequency**: How often user engages with platform
- **Engagement Score**: Overall user engagement level
- **Recent Activity**: Activity in specific time windows

#### Social Factors
- **Referral Count**: Number of successful referrals
- **Referral Quality**: Quality and engagement of referred users
- **Social Influence**: Network impact and reach

#### Temporal Factors
- **Join Order**: Priority based on waitlist join time
- **Time-based Decay**: Gradual score reduction over time
- **Seasonal Adjustments**: Time-based scoring variations

#### Manual Factors
- **Admin Boosts**: Manual priority adjustments
- **Special Promotions**: Campaign-based score changes
- **Penalty Adjustments**: Score reductions for specific reasons

## API Endpoints

### Calculate Individual Score
```
POST /waitlist/dynamic-scoring/calculate
```

**Request Body:**
```json
{
  "userId": "user-123",
  "waitlistId": "waitlist-456",
  "configurationId": "default"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "userId": "user-123",
    "waitlistId": "waitlist-456",
    "rawScore": 75.3,
    "normalizedScore": 0.753,
    "finalScore": 75.3,
    "factorContributions": {
      "referralCount": 18.5,
      "engagementScore": 22.6,
      "activityFrequency": 11.3,
      "joinOrder": 12.2,
      "socialInfluence": 8.1,
      "manualBoost": 2.6
    },
    "explanation": "Your priority score of 75.3 is calculated from several factors: engagement score (22.6 points, 20% weight), referral count (18.5 points, 25% weight), activity frequency (11.3 points, 15% weight), join order (12.2 points, 15% weight), social influence (8.1 points, 10% weight), manual boost (2.6 points, 5% weight). You have a good priority score with room for improvement through increased engagement.",
    "confidence": 0.85,
    "metadata": {
      "scoringTime": 45,
      "factorsUsed": ["referralCount", "engagementScore", "activityFrequency"],
      "dataQuality": 0.92
    }
  }
}
```

### Batch Calculate Scores
```
POST /waitlist/dynamic-scoring/batch-calculate
```

**Request Body:**
```json
{
  "waitlistId": "waitlist-456",
  "configurationId": "default"
}
```

### Update Configuration
```
POST /waitlist/dynamic-scoring/config/:configurationId
```

**Request Body:**
```json
{
  "config": {
    "factors": [
      {
        "name": "referralCount",
        "weight": 0.30,
        "enabled": true,
        "description": "Number of successful referrals",
        "category": "social"
      }
    ],
    "normalizationMethod": "min_max"
  },
  "updatedBy": "admin-user"
}
```

### Get Score Trend
```
GET /waitlist/dynamic-scoring/trend/:userId/:waitlistId
```

### Get Scoring Analytics
```
GET /waitlist/dynamic-scoring/analytics/:waitlistId
```

## Scoring Algorithm

### Factor Calculation

Each scoring factor is calculated independently and then combined using weighted averages:

#### 1. Join Order Score
```typescript
function calculateJoinOrderScore(features): number {
  // Earlier join = higher score, inverted and normalized
  const joinOrderScore = Math.max(0, 100 - (features.daysSinceJoin / 365) * 100);
  return Math.min(100, Math.max(0, joinOrderScore));
}
```

#### 2. Referral Count Score
```typescript
function calculateReferralCountScore(features): number {
  // Exponential scaling for referrals (diminishing returns)
  const baseScore = Math.log10(features.referralCount + 1) * 25;
  return Math.min(100, Math.max(0, baseScore));
}
```

#### 3. Engagement Score
```typescript
function calculateEngagementScore(features): number {
  // Direct use of engagement score, capped at 100
  return Math.min(100, Math.max(0, features.engagementScore));
}
```

#### 4. Activity Frequency Score
```typescript
function calculateActivityFrequencyScore(features): number {
  // Normalize activity frequency to 0-100 scale
  const frequencyScore = Math.min(100, features.activityFrequency * 100);
  return Math.max(0, frequencyScore);
}
```

### Score Combination

Individual factor scores are combined using configurable weights:

```typescript
function combineFactorScores(factorScores, config): number {
  let totalScore = 0;
  let totalWeight = 0;

  for (const factor of config.factors) {
    if (!factor.enabled) continue;
    
    const factorScore = factorScores[factor.name] || 0;
    totalScore += factorScore * factor.weight;
    totalWeight += factor.weight;
  }

  return totalWeight > 0 ? totalScore / totalWeight : 0;
}
```

### Normalization Methods

#### Min-Max Normalization
```typescript
function minMaxNormalization(score, range): number {
  // Assuming input score is 0-100, normalize to target range
  const normalized = (score / 100) * (range.max - range.min) + range.min;
  return Math.max(range.min, Math.min(range.max, normalized));
}
```

#### Z-Score Normalization
```typescript
function zScoreNormalization(score): number {
  // Simple z-score approximation
  const mean = 50; // Assumed mean
  const stdDev = 25; // Assumed standard deviation
  const zScore = (score - mean) / stdDev;
  return Math.max(0, Math.min(100, (zScore + 2) * 25));
}
```

#### Robust Normalization
```typescript
function robustNormalization(score): number {
  // Robust scaling using median and IQR
  const median = 50; // Assumed median
  const iqr = 40; // Assumed interquartile range
  const robustScore = (score - median) / iqr;
  return Math.max(0, Math.min(100, (robustScore + 1.5) * 40));
}
```

### Final Adjustments

#### Time-based Decay
```typescript
function applyTimeBasedDecay(score, features): number {
  let adjustedScore = score;

  // Apply time-based decay if configured
  if (features.daysSinceJoin > 365) {
    const decayFactor = Math.max(0.7, 1 - (features.daysSinceJoin - 365) / 730);
    adjustedScore *= decayFactor;
  }

  return adjustedScore;
}
```

#### Outlier Handling
```typescript
function handleOutliers(score, config): number {
  switch (config.outlierHandling) {
    case 'clip':
      return Math.max(config.scoreRange.min * 0.1, 
                     Math.min(config.scoreRange.max * 1.1, score));
    case 'transform':
      // Apply log transformation for extreme values
      if (score > 90) {
        return 90 + Math.log10(score - 89) * 10;
      }
      return score;
    default:
      return score;
  }
}
```

## Performance Optimization

### Efficient Calculations

#### Batch Processing
- **Vector Operations**: Use array operations for bulk calculations
- **Parallel Processing**: Concurrent score calculations
- **Memory Management**: Efficient data structure usage
- **Database Optimization**: Minimized query patterns

#### Caching Strategy
- **Score Caching**: Store calculated scores temporarily
- **Feature Caching**: Cache extracted features
- **Configuration Caching**: In-memory configuration storage
- **Invalidation**: Smart cache invalidation

### Scalability Considerations

#### Large Waitlists
- **Chunked Processing**: Process in manageable batches
- **Progressive Updates**: Update scores incrementally
- **Resource Management**: Control memory and CPU usage
- **Background Processing**: Non-blocking score updates

## Analytics and Monitoring

### Score Distribution

#### Statistical Analysis
- **Mean/Median/Mode**: Central tendency measures
- **Standard Deviation**: Score variability
- **Percentiles**: Score distribution analysis
- **Histograms**: Visual score distribution

#### Trend Analysis
- **Score Changes**: Individual score evolution
- **Waitlist Trends**: Overall waitlist changes
- **Factor Impact**: Factor contribution changes over time
- **Seasonal Patterns**: Time-based variations

### Factor Analysis

#### Contribution Analysis
- **Factor Rankings**: Most influential factors
- **Weight Optimization**: Suggest optimal weight adjustments
- **Correlation Analysis**: Factor interdependencies
- **Effectiveness Metrics**: Factor predictive power

#### Performance Metrics
- **Calculation Time**: Score generation performance
- **Accuracy Metrics**: Score prediction quality
- **User Satisfaction**: Score acceptance rates
- **Business Impact**: Score business effectiveness

## Configuration Management

### Dynamic Configuration

#### Runtime Updates
- **Hot Configuration**: Changes without service restart
- **Validation**: Configuration sanity and consistency checks
- **Rollback**: Previous configuration restoration
- **Audit Trail**: Complete change history

#### Factor Management
- **Enable/Disable**: Turn factors on/off
- **Weight Adjustment**: Modify factor importance
- **New Factors**: Add custom scoring factors
- **Factor Testing**: Validate factor effectiveness

### Environment Management

#### Configuration Environments
- **Development**: Experimental configurations
- **Staging**: Pre-production testing
- **Production**: Stable, validated configurations
- **Emergency**: Critical issue configurations

## Integration Points

### Existing Services

#### Feature Engineering
- **Feature Extraction**: Real-time feature calculation
- **Data Validation**: Input data quality checks
- **Feature Caching**: Performance optimization
- **Feature Updates**: Automatic feature refresh

#### Waitlist Management
- **Score Storage**: Persistent score storage
- **Rank Updates**: Automatic rank recalculation
- **User Notifications**: Score change alerts
- **Analytics Integration**: Score analytics storage

### External Systems

#### User Dashboard
- **Score Display**: Real-time score presentation
- **Factor Breakdown**: Detailed score components
- **Trend Visualization**: Historical score graphs
- **Improvement Suggestions**: Actionable recommendations

#### Admin Panel
- **Configuration UI**: Visual configuration management
- **Analytics Dashboard**: Comprehensive analytics display
- **User Management**: Manual score adjustments
- **System Monitoring**: Performance and health metrics

## Usage Examples

### Basic Score Calculation

```typescript
const scoreResult = await scoringService.calculatePriorityScore(
  'user-123',
  'waitlist-456',
  'default'
);

console.log('Final score:', scoreResult.finalScore);
console.log('Factor contributions:', scoreResult.factorContributions);
console.log('Explanation:', scoreResult.explanation);
```

### Configuration Update

```typescript
const updatedConfig = await scoringService.updateScoringConfiguration(
  'default',
  {
    factors: [
      {
        name: 'referralCount',
        weight: 0.30, // Increased from 0.25
        enabled: true,
        description: 'Number of successful referrals',
        category: 'social'
      }
    ]
  },
  'admin-user'
);
```

### Batch Processing

```typescript
const results = await scoringService.batchCalculateScores(
  'waitlist-456',
  'default'
);

console.log(`Processed ${results.totalUsers} users`);
console.log('Average score:', results.data.reduce((sum, r) => sum + r.finalScore, 0) / results.data.length);
```

### Analytics Retrieval

```typescript
const analytics = await scoringService.getScoringAnalytics('waitlist-456');

console.log('Score statistics:', analytics.statistics);
console.log('Score distribution:', analytics.distribution);
console.log('Factor analysis:', analytics.factorAnalysis);
```

## Future Enhancements

### Advanced Algorithms
- **Machine Learning**: ML-based scoring models
- **Neural Networks**: Deep learning approaches
- **Ensemble Methods**: Multiple algorithm combination
- **Reinforcement Learning**: Adaptive scoring systems

### Enhanced Features
- **Personalization**: User-specific scoring factors
- **Context Awareness**: Situation-based scoring
- **Predictive Scoring**: Future behavior prediction
- **Multi-objective**: Multiple optimization goals

### Performance Improvements
- **GPU Acceleration**: Hardware-accelerated calculations
- **Distributed Computing**: Scalable processing
- **Edge Computing**: Local score calculations
- **Real-time Streaming**: Continuous score updates

## Conclusion

The Dynamic Priority Scoring system provides a flexible, transparent, and performant solution for waitlist prioritization. The implementation balances configurability with performance, ensuring that the scoring algorithm can adapt to changing business requirements while maintaining high efficiency and user trust.
