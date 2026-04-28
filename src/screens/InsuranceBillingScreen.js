import React from 'react';
import { Alert, Linking, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ScreenWrapper } from '../components/ScreenWrapper';
import { useAuth } from '../AuthContext';

const BILLING_PHONE = '+18556842962';
const BILLING_EMAIL = 'billing@centriahealthcare.com';
const PAYMENT_URL = 'https://centriahealthcare.com/billing/';

function openUrl(url) {
  Linking.openURL(url).catch(() => Alert.alert('Cannot open link', 'Please try again later.'));
}

function Field({ label, value }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value || 'N/A'}</Text>
    </View>
  );
}

export default function InsuranceBillingScreen() {
  const { user } = useAuth();
  const insurance = user?.insurance || {};
  const subscriberName = insurance.subscriberName || user?.name || 'N/A';
  const memberId = insurance.memberId || 'N/A';
  const groupNumber = insurance.groupNumber || 'N/A';
  const expirationDate = insurance.expirationDate || 'N/A';
  const relation = insurance.relationToSubscriber || 'Self';
  const planLabel = insurance.planLabel || 'Primary';

  const onMakePayment = () => {
    if (Platform.OS === 'web') {
      openUrl(PAYMENT_URL);
    } else {
      openUrl(PAYMENT_URL);
    }
  };

  const onContact = () => {
    Alert.alert(
      'Contact Billing',
      'How would you like to reach billing?',
      [
        { text: 'Call', onPress: () => openUrl(`tel:${BILLING_PHONE}`) },
        { text: 'Email', onPress: () => openUrl(`mailto:${BILLING_EMAIL}?subject=${encodeURIComponent('Billing Question')}`) },
        { text: 'Cancel', style: 'cancel' },
      ],
      { cancelable: true }
    );
  };

  return (
    <ScreenWrapper bannerTitle="Billing & Insurance" style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionTitle}>Your Insurance Plans</Text>

        <View style={styles.card}>
          <View style={styles.planBadge}>
            <Text style={styles.planBadgeText}>{planLabel}</Text>
          </View>

          <View style={styles.row}>
            <Field label="Expiration Date" value={expirationDate} />
            <Field label="Subscriber Name" value={subscriberName} />
          </View>

          <View style={styles.row}>
            <Field label="Relation to Subscriber" value={relation} />
            <Field label="Member ID" value={memberId} />
          </View>

          <View style={styles.row}>
            <Field label="Group Number" value={groupNumber} />
            <View style={styles.field} />
          </View>
        </View>

        <View style={styles.actionsRow}>
          <TouchableOpacity style={styles.actionButton} onPress={onMakePayment} accessibilityRole="button">
            <Text style={styles.actionButtonText}>Make Payment</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={onContact} accessibilityRole="button">
            <Text style={styles.actionButtonText}>Contact</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#f5f6f8',
  },
  content: {
    padding: 16,
    paddingBottom: 16,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  actionButton: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: '#1d4ed8',
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  actionButtonText: {
    color: '#1d4ed8',
    fontSize: 16,
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: 16,
    color: '#111827',
    marginBottom: 12,
    marginLeft: 4,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 18,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  planBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#dbeafe',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    marginBottom: 18,
  },
  planBadgeText: {
    color: '#1d4ed8',
    fontWeight: '600',
    fontSize: 13,
  },
  row: {
    flexDirection: 'row',
    marginBottom: 14,
  },
  field: {
    flex: 1,
    paddingRight: 8,
  },
  fieldLabel: {
    color: '#6b7280',
    fontSize: 13,
    marginBottom: 4,
  },
  fieldValue: {
    color: '#111827',
    fontSize: 16,
  },
});
