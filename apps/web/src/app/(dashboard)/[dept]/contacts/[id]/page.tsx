import { getContact, getOutreachHistory } from "@/lib/contacts/actions";
import { getEntityDocuments } from "@/lib/documents/actions";
import { ContactDetail } from "@/components/contacts/contact-detail";

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ dept: string; id: string }>;
}) {
  const { dept, id } = await params;
  const [contact, outreach, documents] = await Promise.all([
    getContact(id),
    getOutreachHistory(id),
    getEntityDocuments("contact", id),
  ]);

  return (
    <ContactDetail
      contact={contact}
      outreach={outreach}
      documents={documents}
      dept={dept}
    />
  );
}
