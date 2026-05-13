import { UserEmailData } from '../../../../../../types/user-email'
import Email from './email'
import EmailCell from './cell'
import Actions from './actions'
import OLRow from '@/shared/components/ol/ol-row'
import OLCol from '@/shared/components/ol/ol-col'

type EmailsRowProps = {
  userEmailData: UserEmailData
  primary?: UserEmailData
}

function EmailsRow({ userEmailData, primary }: EmailsRowProps) {
  return (
    <OLRow data-testid="email-row">
      <OLCol lg={8}>
        <EmailCell>
          <Email userEmailData={userEmailData} />
        </EmailCell>
      </OLCol>
      <OLCol lg={4}>
        <EmailCell className="text-lg-end">
          <Actions userEmailData={userEmailData} primary={primary} />
        </EmailCell>
      </OLCol>
    </OLRow>
  )
}

export default EmailsRow
