import { TopBar } from '@/components/layout/TopBar';
import { Search, HelpCircle, MessageCircle, Shield, CreditCard, User } from 'lucide-react';
import { useState } from 'react';
import { Input } from '@/components/ui/input';

export default function HelpPage() {
  const [searchQuery, setSearchQuery] = useState('');

  const categories = [
    {
      icon: User,
      title: 'Account & Profile',
      topics: [
        'How to change username',
        'Update profile information',
        'Verify your account',
        'Delete your account',
        'Privacy settings',
      ],
    },
    {
      icon: MessageCircle,
      title: 'Posts & Engagement',
      topics: [
        'How to post videos',
        'Create polls',
        'Schedule posts',
        'Use hashtags effectively',
        'Report inappropriate content',
      ],
    },
    {
      icon: CreditCard,
      title: 'Payments & Monetization',
      topics: [
        'Boost your posts',
        'Payment methods (PayPal, M-Pesa)',
        'Creator earnings',
        'Premium subscriptions',
        'Refund policy',
      ],
    },
    {
      icon: Shield,
      title: 'Safety & Security',
      topics: [
        'Block or mute users',
        'Report abuse',
        'Two-factor authentication',
        'Suspicious activity',
        'Content guidelines',
      ],
    },
  ];

  const filteredCategories = searchQuery
    ? categories.map(cat => ({
        ...cat,
        topics: cat.topics.filter(topic =>
          topic.toLowerCase().includes(searchQuery.toLowerCase())
        ),
      })).filter(cat => cat.topics.length > 0)
    : categories;

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      <TopBar title="Help Center" showBack />

      <div className="max-w-4xl mx-auto p-6">
        {/* Search */}
        <div className="mb-8">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search for help..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-12 h-12 text-base"
            />
          </div>
        </div>

        {/* Welcome Message */}
        <div className="mb-8 text-center">
          <HelpCircle className="w-16 h-16 mx-auto mb-4 text-primary" />
          <h1 className="text-3xl font-bold mb-2">How can we help you?</h1>
          <p className="text-muted-foreground">
            Search for answers or browse categories below
          </p>
        </div>

        {/* Categories */}
        <div className="space-y-6">
          {filteredCategories.map((category, index) => {
            const Icon = category.icon;
            return (
              <div key={index} className="border border-border rounded-lg overflow-hidden">
                <div className="bg-muted/30 p-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Icon className="w-5 h-5 text-primary" />
                  </div>
                  <h2 className="text-xl font-bold">{category.title}</h2>
                </div>
                <div className="divide-y divide-border">
                  {category.topics.map((topic, topicIndex) => (
                    <button
                      key={topicIndex}
                      className="w-full p-4 text-left hover:bg-muted/50 transition-colors flex items-center justify-between group"
                    >
                      <span>{topic}</span>
                      <span className="text-muted-foreground group-hover:text-foreground transition-colors">
                        →
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Contact Support */}
        <div className="mt-12 bg-gradient-to-r from-primary/10 to-purple-500/10 rounded-xl p-8 text-center border border-primary/20">
          <MessageCircle className="w-12 h-12 mx-auto mb-4 text-primary" />
          <h3 className="text-2xl font-bold mb-2">Still need help?</h3>
          <p className="text-muted-foreground mb-6">
            Our support team is here to help you
          </p>
          <a
            href="mailto:support@tsocial.com"
            className="inline-block px-6 py-3 bg-primary text-primary-foreground rounded-full font-semibold hover:opacity-90 transition-opacity"
          >
            Contact Support
          </a>
        </div>

        {/* Quick Links */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 border border-border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors">
            <h4 className="font-semibold mb-1">Community Guidelines</h4>
            <p className="text-sm text-muted-foreground">Learn about our rules</p>
          </div>
          <div className="p-4 border border-border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors">
            <h4 className="font-semibold mb-1">Privacy Policy</h4>
            <p className="text-sm text-muted-foreground">How we protect your data</p>
          </div>
          <div className="p-4 border border-border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors">
            <h4 className="font-semibold mb-1">Terms of Service</h4>
            <p className="text-sm text-muted-foreground">Terms and conditions</p>
          </div>
        </div>
      </div>
    </div>
  );
}
