# Referral Notification System

## Overview

The stellAIverse platform now includes a comprehensive referral and notification system that enables users to invite others and receive timely notifications about referral events through both email and in-app channels.

## Features

- **Multi-Channel Notifications**: Email and in-app notifications
- **User Preferences**: Granular control over notification settings
- **Referral Tracking**: Complete lifecycle tracking from invite to reward
- **Email Templates**: Professional, branded email templates
- **Audit Trail**: Event logging for compliance and analytics
- **Preference Management**: Users control what notifications they receive

## Architecture

### Core Components

1. **Referral Entities**
   - `Referral`: Tracks referral relationships
   - `ReferralEvent`: Logs lifecycle events
   - `Notification`: In-app notifications
   - `NotificationPreferences`: User preferences

2. **Services**
   - `ReferralNotificationService`: Main referral logic and notifications
   - `NotificationService`: Unified notification delivery
   - `ReferralEmailTemplates`: Email template generation

3. **Integration**
   - Existing `EmailService` extended for generic emails
   - TypeORM entities with proper relationships
   - Event-driven architecture

## Database Schema

### Tables Created

**referrals**
- Tracks invitation relationships between users
- Status: pending → registered → active → rewarded
- Stores referral codes and metadata

**referral_events**  
- Immutable event log for each referral
- Events: invite_sent, registration_completed, reward_earned, etc.
- JSONB data field for flexible event metadata

**notifications**
- In-app notification storage
- Read/unread tracking
- Priority levels: low, medium, high, urgent
- Channel tracking: in_app, email, both

**notification_preferences**
- User-specific notification settings
- Global enable/disable per channel
- Type-specific preferences
- Referral, marketing, system categories

## API Usage

### Send Referral Invitation

```typescript
// Using the service
const referral = await referralNotificationService.sendReferralInvite({
  referrerId: 'user-uuid',
  refereeEmail: 'friend@example.com',
  message: 'Join me on StellAIverse!',
  metadata: { source: 'web-app' },
});
```

### Notification Triggers

The system automatically sends notifications for:

1. **Invite Sent** - When user sends referral invitation
   - Email to referee
   - In-app confirmation to referrer

2. **Registration Completed** - When referee signs up
   - Email + in-app to referrer
   - Welcome notification to referee

3. **Reward Earned** - When referrer earns reward
   - Email + in-app notification with reward details

4. **Milestone Reached** - When referral achieves milestone
   - In-app notification to referrer

### User Preferences API

```typescript
// Get user preferences
const prefs = await notificationService.getPreferences(userId);

// Update preferences
await notificationService.updatePreferences(userId, {
  emailEnabled: true,
  inAppEnabled: true,
  referralNotificationsEnabled: true,
  marketingNotificationsEnabled: false,
});

// Check if specific notification is allowed
const allowed = prefs.isEmailAllowed('referral.reward_earned');
```

### Send Custom Notification

```typescript
await notificationService.sendNotification({
  userId: 'user-uuid',
  type: 'custom.event',
  title: 'Something Happened!',
  message: 'Details about what happened...',
  data: { customData: 'here' },
  priority: NotificationPriority.MEDIUM,
  channel: NotificationChannel.BOTH,
  actionUrl: '/some-page',
});
```

## Email Templates

### Referral Invitation Template

Features:
- Professional gradient header
- Personalized message from referrer
- Clear call-to-action button
- Referral code display
- Benefits list
- Mobile-responsive design

Customization:
- Located in `src/referral/email-templates/`
- Can be themed with brand colors
- Supports dynamic content insertion

## Notification Types

### Referral Notifications
- `referral.invite_sent` - Invitation sent
- `referral.registration_completed` - Friend joined
- `referral.reward_earned` - Reward received
- `referral.milestone_reached` - Milestone achieved
- `referral.welcome` - Welcome message for new user

### System Notifications
- `system.maintenance` - Scheduled maintenance
- `system.security` - Security alerts

### Marketing Notifications (opt-in)
- `marketing.promotion` - Special offers
- `marketing.feature` - New features

## Integration Examples

### Frontend Integration

```javascript
// Get unread notifications count
const getUnreadCount = async (userId) => {
  const response = await fetch(`/notifications/${userId}/unread`);
  const data = await response.json();
  return data.count;
};

// Mark notification as read
const markAsRead = async (notificationId, userId) => {
  await fetch(`/notifications/${notificationId}/read`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId }),
  });
};

// Send referral invitation
const sendReferral = async (referrerId, refereeEmail, message) => {
  const response = await fetch('/referrals/invite', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      referrerId,
      refereeEmail,
      message,
    }),
  });
  return await response.json();
};
```

### WebSocket Real-time Updates

```typescript
// In your gateway
@WebSocketGateway()
export class NotificationGateway {
  @SubscribeMessage('subscribe-notifications')
  handleSubscription(client: Socket, userId: string) {
    client.join(`notifications:${userId}`);
  }

  // Broadcast when notification created
  broadcastNotification(userId: string, notification: Notification) {
    this.server.to(`notifications:${userId}`).emit(
      'notification',
      notification
    );
  }
}
```

## Preference Management

Users can manage preferences via API or UI:

**Default Settings:**
- ✅ Email notifications: Enabled
- ✅ In-app notifications: Enabled  
- ✅ Referral notifications: Enabled
- ❌ Marketing notifications: Disabled
- ✅ System notifications: Enabled

**Granular Control:**
- Per-channel enable/disable
- Per-notification-type lists
- Category-level toggles

## Testing

Run the migration:
```bash
npm run migration:run
```

Test email sending (development):
- Ethereal test accounts are auto-created
- Preview URLs logged to console
- No real emails sent without SMTP config

## Configuration

### Environment Variables

```bash
# Email Configuration
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=noreply@example.com
SMTP_PASSWORD=secret
EMAIL_FROM="StellAIverse" <noreply@example.com>

# Application
FRONTEND_URL=https://app.stellaiverse.com
```

### Development Mode

Uses [Ethereal Email](https://ethereal.email) for testing:
- Fake SMTP service
- Capture all emails
- Web interface for preview
- No actual sending

## Monitoring and Analytics

Track key metrics:
- Invitations sent per day
- Conversion rate (invite → registration)
- Reward distribution
- Notification open rates
- User preference trends

Query examples:
```sql
-- Referrals this week
SELECT COUNT(*) FROM referrals 
WHERE createdAt > NOW() - INTERVAL '7 days';

-- Most effective referrers
SELECT referrerId, COUNT(*) as total
FROM referrals
GROUP BY referrerId
ORDER BY total DESC;

-- Notification engagement
SELECT type, COUNT(*) FILTER (WHERE isRead = true) as read_count
FROM notifications
GROUP BY type;
```

## Security Considerations

- **XSS Prevention**: All user content escaped in emails
- **Rate Limiting**: Apply to invitation endpoints
- **Email Validation**: Verify referee email format
- **Code Expiration**: Optional expiry for referral codes
- **Fraud Detection**: Monitor for abuse patterns

## Future Enhancements

Potential improvements:
- Push notifications (mobile/web)
- SMS notifications via Twilio
- A/B testing for email templates
- Referral reward automation
- Multi-tier referral program
- Referral leaderboard
- Batch notification processing
- Scheduled digest emails

## Troubleshooting

**Issue: Emails not sending**
- Check SMTP configuration
- Verify Ethereal test account in development
- Check spam folder
- Review email logs

**Issue: Notifications not appearing**
- Check user preferences
- Verify userId is correct
- Query notifications table directly
- Check WebSocket connection for real-time

**Issue: Migration fails**
- Ensure PostgreSQL 12+ for jsonb array support
- Check existing table conflicts
- Run with verbose logging

## Support

For questions or issues:
- Check main project documentation
- Review entity definitions for schema details
- Inspect referral_events for debugging
- Contact support team

---

© 2026 StellAIverse. All rights reserved.
