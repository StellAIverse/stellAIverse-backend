# ML-Based Recommendation System

## Overview

The stellAIverse platform now includes a machine learning-based ranking system for agent recommendations. This system provides personalized, explainable, and auditable agent recommendations that improve over time through user feedback.

## Features

- **Personalized Ranking**: ML-powered scoring based on user behavior and preferences
- **Explainable AI**: Clear explanations for why each agent is recommended
- **Feedback Loop**: Continuous learning from explicit ratings and implicit interactions
- **Audit Trail**: Complete logging of all recommendations and feedback for compliance
- **Real-time Performance**: Low-latency responses suitable for interactive applications

## Architecture

### Components

1. **ML Model Service** (`ml-model.service.ts`)
   - Logistic regression model for interpretable predictions
   - Feature extraction from user-agent interactions
   - Periodic retraining based on new feedback

2. **Feedback Service** (`feedback.service.ts`)
   - Collects explicit feedback (ratings 1-5)
   - Tracks implicit feedback (clicks, dismissals, usage)
   - Provides analytics and statistics

3. **Recommendation Service** (`recommendation.service.ts`)
   - Combines ML scores with traditional metrics
   - Filters by capabilities
   - Tracks impressions automatically

4. **Audit Service** (`recommendation-audit.service.ts`)
   - Logs all recommendation requests/responses
   - Tracks feedback submissions
   - Records model training events

### Database Schema

Two new tables are created:

**recommendation_feedback**
- `id` (uuid): Primary key
- `userId` (uuid): User who provided feedback
- `agentId` (varchar): Agent being rated
- `feedbackType` (enum): Type of feedback
- `rating` (int): 1-5 rating value
- `metadata` (jsonb): Additional context
- `sessionId` (varchar): Anonymous session tracking
- `createdAt` (timestamp)

**recommendation_interactions**
- `id` (uuid): Primary key
- `userId` (uuid): User who interacted
- `agentId` (varchar): Agent being interacted with
- `interactionType` (enum): Type of interaction
- `position` (int): Position in recommendation list
- `sessionId` (varchar): Anonymous session tracking
- `context` (jsonb): Interaction context
- `viewDurationMs` (bigint): Time spent viewing
- `createdAt` (timestamp)

## API Endpoints

### Get Recommendations

```http
GET /recommendations
```

**Query Parameters:**
- `userId` (optional): User ID for personalization
- `capabilities` (optional): Comma-separated list of required capabilities
- `limit` (optional): Maximum number of results (default: 10)
- `sessionId` (optional): Session ID for anonymous tracking

**Example:**
```bash
GET /recommendations?userId=user123&capabilities=trading,analysis&limit=5
```

**Response:**
```json
[
  {
    "agentId": "1",
    "name": "AlphaScout",
    "totalScore": 0.8542,
    "mlScore": 0.8721,
    "traditionalScore": 83.50,
    "explanation": {
      "performanceScore": 92,
      "usageScore": 75.50,
      "performanceWeight": 0.7,
      "usageWeight": 0.3,
      "mlFeatures": {
        "userHasHistory": 1,
        "userAvgRating": 0.8,
        "agentPerformanceScore": 0.92,
        "capabilityMatch": 1.0
      }
    }
  }
]
```

### Submit Feedback

```http
POST /recommendations/feedback
```

**Body:**
```json
{
  "userId": "user123",
  "agentId": "1",
  "feedbackType": "explicit_rating",
  "rating": 5,
  "metadata": { "source": "web-app" },
  "sessionId": "session456"
}
```

**Feedback Types:**
- `explicit_rating`: User-provided rating (1-5)
- `usage`: User actually used the agent
- `click`: User clicked on recommendation
- `dismiss`: User dismissed recommendation

### Record Interaction

```http
POST /recommendations/interactions
```

**Body:**
```json
{
  "userId": "user123",
  "agentId": "1",
  "interactionType": "click",
  "position": 2,
  "sessionId": "session456",
  "context": { "page": "discover" },
  "viewDurationMs": 1500
}
```

**Interaction Types:**
- `impression`: Recommendation was shown
- `click`: User clicked on recommendation
- `dismiss`: User dismissed recommendation
- `conversion`: User used the recommended agent

### Quick Feedback Actions

Simplified endpoints for common actions:

```bash
# Record click
POST /recommendations/:agentId/click
{ "userId": "user123", "sessionId": "session456" }

# Record dismiss
POST /recommendations/:agentId/dismiss
{ "userId": "user123", "sessionId": "session456" }

# Record usage
POST /recommendations/:agentId/use
{ "userId": "user123", "sessionId": "session456" }
```

### Get Agent Statistics

```http
GET /recommendations/agents/:agentId/stats
```

**Response:**
```json
{
  "success": true,
  "data": {
    "totalFeedback": 45,
    "averageRating": 4.2,
    "distribution": {
      "1": 2,
      "2": 3,
      "3": 5,
      "4": 15,
      "5": 20
    },
    "positiveCount": 35,
    "negativeCount": 5
  }
}
```

### Get User Feedback History

```http
GET /recommendations/users/:userId/feedback?limit=50
```

### Train Model (Admin)

```http
POST /recommendations/train
```

Triggers manual model retraining on all accumulated feedback data.

### Get Model Information

```http
GET /recommendations/model/info
```

Returns current model weights and feature importance for auditing.

## ML Model Details

### Features Used

The logistic regression model uses these features:

1. **User Features**
   - `userHasHistory`: Whether user has feedback history
   - `userAvgRating`: User's average rating given

2. **Agent Features**
   - `agentPerformanceScore`: Agent's performance metric (0-100)
   - `agentUsageCount`: How often agent is used
   - `agentHasUserHistory`: Whether user has interacted with this agent before
   - `agentAvgFeedback`: Average feedback for this agent from this user

3. **Context Features**
   - `recencyScore`: User's recent activity level
   - `capabilityMatch`: How well agent matches requested capabilities

### Model Training

The model trains automatically every 100 feedback submissions. Manual training can be triggered via the `/train` endpoint.

**Training Process:**
1. Gather historical feedback and interactions
2. Extract feature vectors for each example
3. Run gradient descent with L2 regularization
4. Update model weights

### Explainability

Each recommendation includes:
- **Feature values**: What the model knows about user/agent
- **Score breakdown**: ML score vs traditional score
- **Feature importance**: Which features matter most (available via `/model/info`)

## Audit and Compliance

All recommendation activities are logged via the provenance system:

- **Request Logging**: Who requested what, when
- **Response Logging**: What was recommended, in what order
- **Feedback Logging**: All user feedback captured
- **Training Logging**: When and why models are retrained

Audit logs can be queried via the provenance endpoints.

## Integration Example

### Frontend Integration

```javascript
// Get personalized recommendations
const getRecommendations = async (userId, sessionId) => {
  const response = await fetch(
    `/recommendations?userId=${userId}&sessionId=${sessionId}`
  );
  return await response.json();
};

// Track user clicking on a recommendation
const trackClick = async (agentId, userId, sessionId) => {
  await fetch(`/recommendations/${agentId}/click`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, sessionId }),
  });
};

// Submit a rating
const submitRating = async (agentId, userId, rating) => {
  await fetch('/recommendations/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId,
      agentId,
      feedbackType: 'explicit_rating',
      rating,
    }),
  });
};
```

### Backend Usage

```typescript
// In your NestJS service
@Injectable()
export class YourService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  async showRecommendations(userId: string) {
    // Get user's personalized recommendations
    const recommendations = await this.recommendationService.getRecommendations({
      userId,
      capabilities: ['trading'],
      limit: 5,
    });

    // Recommendations are already sorted by score
    // and include explanations
    return recommendations;
  }
}
```

## Performance Considerations

- **Caching**: Consider caching recommendations for anonymous users
- **Batch Tracking**: Impression tracking is done asynchronously to avoid blocking
- **Model Updates**: Model retraining happens in background
- **Database Indexes**: Proper indexes on userId, agentId, and createdAt

## Testing

Run the e2e tests:

```bash
npm run test:e2e -- recommendation
```

Tests cover:
- Basic recommendation retrieval
- Filtering and sorting
- Feedback submission
- Interaction tracking
- Personalization flow
- Audit logging

## Migration

Apply the database migration:

```bash
npm run migration:run
```

This creates the necessary tables for feedback and interaction tracking.

## Future Enhancements

Potential improvements:
- A/B testing framework for model comparison
- More sophisticated ML models (neural collaborative filtering)
- Real-time model updates
- Contextual bandits for exploration/exploitation
- Multi-armed bandit for cold-start problem
- Demographic parity and fairness constraints

## Troubleshooting

**Issue: Recommendations not personalized**
- Ensure userId is being passed
- Check that feedback data exists for the user
- Verify model has been trained (check `/model/info`)

**Issue: Slow response times**
- Check database query performance
- Consider caching frequently requested recommendations
- Monitor model prediction latency

**Issue: Model not improving**
- Collect more feedback data
- Check feature quality and distribution
- Adjust learning rate or regularization parameters

## Support

For questions or issues, refer to the main project documentation or open an issue in the repository.
